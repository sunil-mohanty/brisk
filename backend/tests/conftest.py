import os

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite:///./test.db")
os.environ["APP_URL"] = "https://app.test"
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-bytes-long"
os.environ["OPEN_SIGNUP"] = "true"
os.environ["ADMIN_EMAILS"] = "boss@tressa.app"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    from app.activity import reset_cache
    from app.routers.auth import _signups_by_ip

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    reset_cache()
    _signups_by_ip.clear()
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(engine)


def signup(client, email="owner@layla.ae", business="Layla Beauty Lounge"):
    r = client.post(
        "/api/auth/signup",
        json={"business_name": business, "name": "Sunil", "email": email, "password": "supersecret", "phone": "050 123 4567"},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}
