import io
import quopri

from openpyxl import Workbook

from app.importer import clean_phone, parse_csv, parse_text, parse_vcf, parse_xlsx

from .conftest import signup

IPHONE_VCF = """BEGIN:VCARD\r
VERSION:3.0\r
N:Al Mansoori;Ahmed;;;\r
FN:Ahmed Al Mansoori\r
item1.TEL;type=CELL;type=VOICE;type=pref:+971 50 441 2290\r
TEL;type=WORK:04 222 3333\r
item2.EMAIL;type=INTERNET:ahmed@example.ae\r
item3.ADR;type=HOME:;;Street 5;Dubai;;;UAE\r
END:VCARD\r
BEGIN:VCARD\r
VERSION:3.0\r
N:Nair;Priya;;;\r
FN:Priya Nair with a really long name that the phone folded acro\r
 ss two lines\r
TEL;type=CELL:055 918 3301\r
END:VCARD\r
"""


def android_vcf():
    qp = quopri.encodestring("أحمد سعيد".encode()).decode().replace("\n", "")
    folded = qp[:30] + "=\n" + qp[30:]  # Android soft line break
    return (
        "BEGIN:VCARD\nVERSION:2.1\n"
        f"N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;{qp};;;\n"
        f"FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:{folded}\n"
        "TEL;HOME:042223333\nTEL;CELL:0507721065\nEND:VCARD\n"
        "BEGIN:VCARD\nVERSION:2.1\nFN:No Number Person\nEND:VCARD\n"
    )


def test_phone_cleaning():
    assert clean_phone("050 123 4567") == "+971501234567"
    assert clean_phone("00971 50 123 4567") == "+971501234567"
    assert clean_phone("+91 98765 43210") == "+919876543210"
    assert clean_phone("501234567") == "+971501234567"  # Excel dropped the leading 0
    assert clean_phone("123") is None


def test_iphone_vcf():
    rows = parse_vcf(IPHONE_VCF)
    assert [(r.name, r.phone) for r in rows] == [
        ("Ahmed Al Mansoori", "+971504412290"),
        ("Priya Nair with a really long name that the phone folded across two lines", "+971559183301"),
    ]
    assert rows[0].email == "ahmed@example.ae" and rows[0].area == "Dubai"


def test_android_vcf_arabic_and_mobile_preferred():
    rows = parse_vcf(android_vcf())
    assert rows[0].name == "أحمد سعيد"
    assert rows[0].phone == "+971507721065"  # CELL chosen over HOME
    assert rows[1].name == "No Number Person" and rows[1].phone is None


def test_google_csv_and_semicolon_csv():
    google = (
        "First Name,Middle Name,Last Name,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value\n"
        "Omar,,Haddad,* Other,omar@x.ae,Mobile,050 111 2222 ::: +971 4 333 4444\n"
        "Fatima,,Khan,,,Mobile,+971 56 230 8842\n"
    ).encode("utf-8-sig")
    rows = parse_csv(google)
    assert [(r.name, r.phone, r.email) for r in rows] == [
        ("Omar Haddad", "+971501112222", "omar@x.ae"),
        ("Fatima Khan", "+971562308842", None),
    ]
    no_header = "Grace;054 318 9920\nYousef;058 101 4473\n".encode()
    assert [(r.name, r.phone) for r in parse_csv(no_header)] == [("Grace", "+971543189920"), ("Yousef", "+971581014473")]


def test_excel_with_numeric_phones():
    wb = Workbook()
    ws = wb.active
    ws.append(["Customer Name", "Mobile", "Area"])
    ws.append(["Rashid Saeed", 507721065, "Mirdif"])
    ws.append(["Leila Farouk", "055 640 2218", "Muwaileh"])
    buf = io.BytesIO()
    wb.save(buf)
    rows = parse_xlsx(buf.getvalue())
    assert [(r.name, r.phone, r.area) for r in rows] == [
        ("Rashid Saeed", "+971507721065", "Mirdif"),
        ("Leila Farouk", "+971556402218", "Muwaileh"),
    ]


def test_pasted_list():
    text = """Ahmed - 050 441 2290
    Priya Nair: +971 55 918 3301 priya@mail.com
    [10/10/26, 9:01 AM] Omar 052-600-7714
    0561112233
    """
    rows = parse_text(text)
    assert [(r.name, r.phone) for r in rows] == [
        ("Ahmed", "+971504412290"),
        ("Priya Nair", "+971559183301"),
        ("Omar", "+971526007714"),
        ("+971561112233", "+971561112233"),
    ]
    assert rows[1].email == "priya@mail.com"


def test_import_flow(client):
    h = signup(client)
    other = signup(client, "b@b.ae", "Other Biz")
    client.post("/api/customers", json={"name": "Ahmed (already here)", "phone": "0504412290"}, headers=h)
    client.post("/api/customers", json={"name": "Not mine", "phone": "0559183301"}, headers=other)

    files = {"file": ("contacts.vcf", (IPHONE_VCF + android_vcf()).encode(), "text/vcard")}
    pv = client.post("/api/customers/import/preview-file", files=files, headers=h).json()
    st = {r["name"]: r["status"] for r in pv["rows"]}
    assert st["Ahmed Al Mansoori"] == "existing"
    assert pv["rows"][0]["existing_name"] == "Ahmed (already here)"
    assert st["أحمد سعيد"] == "new"
    assert st["No Number Person"] == "no_phone"
    assert st[next(n for n in st if n.startswith("Priya"))] == "new"  # other business's customer doesn't count
    assert pv["counts"] == {"existing": 1, "new": 2, "no_phone": 1}

    # Paste with an in-list duplicate
    pv2 = client.post("/api/customers/import/preview", json={"text": "Grace 0543189920\nGrace again 054 318 9920"}, headers=h).json()
    assert [r["status"] for r in pv2["rows"]] == ["new", "duplicate"]

    # Commit everything (even the ones that would duplicate) - server still skips them
    chosen = [{k: r[k] for k in ("name", "phone", "email", "area")} for r in pv["rows"]]
    res = client.post("/api/customers/import", json={"rows": chosen}, headers=h).json()
    assert res == {"created": 3, "skipped": 1}
    names = {c["name"] for c in client.get("/api/customers", headers=h).json()}
    assert {"أحمد سعيد", "No Number Person", "Ahmed (already here)"} <= names and "Ahmed Al Mansoori" not in names
    again = client.post("/api/customers/import", json={"rows": chosen}, headers=h).json()
    assert again == {"created": 1, "skipped": 3}  # only the number-less row can be added twice

    # Phone picker rows (Android Contact Picker sends name + tel arrays flattened by the page)
    pv3 = client.post("/api/customers/import/preview", json={"rows": [{"name": "Picked", "phone": "+971 50 999 8877"}]}, headers=h).json()
    assert pv3["rows"][0]["phone"] == "+971509998877" and pv3["rows"][0]["status"] == "new"


def test_import_errors(client):
    h = signup(client)
    bad = client.post("/api/customers/import/preview-file", files={"file": ("old.xls", b"\xd0\xcf\x11\xe0junk", "application/vnd.ms-excel")}, headers=h)
    assert bad.status_code == 422 and ".xlsx" in bad.json()["detail"]
    empty = client.post("/api/customers/import/preview", json={"text": "   "}, headers=h)
    assert empty.status_code == 422
    big = client.post("/api/customers/import/preview-file", files={"file": ("big.csv", b"a" * (5 * 1024 * 1024 + 10), "text/csv")}, headers=h)
    assert big.status_code == 413
    assert client.post("/api/customers/import/preview", json={"text": "x 0501234567"}).status_code == 401
