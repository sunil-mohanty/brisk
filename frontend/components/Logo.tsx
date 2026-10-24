/** The Brisk mark: a forward-leaning "B" with copper speed lines. Works for every kind of business. */
const B_PATH =
  "M0 0H12.6C18.4 0 21.6 2.9 21.6 7.3C21.6 10.1 20.2 12.2 17.8 13.3C21 14.3 23 16.9 23 20.5C23 25.6 19.4 30 13.3 30H0ZM5.8 5V12.3H11.8C14.6 12.3 16 10.9 16 8.6C16 6.3 14.6 5 11.8 5ZM5.8 17.1V25H12.6C15.6 25 17.2 23.6 17.2 21C17.2 18.5 15.6 17.1 12.6 17.1Z";

export function BriskMark({ size = 32, tile = "var(--accent)", ink = "#fff", spark = "var(--spark, #d4704a)", title }: {
  size?: number; tile?: string; ink?: string; spark?: string; title?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} className="brisk-mark">
      <rect width="48" height="48" rx="12" fill={tile} />
      <g transform="translate(15 9) skewX(-12)"><path fill={ink} fillRule="evenodd" d={B_PATH} /></g>
      <path d="M6.5 19.5H11.6M4.5 24H10.4M5.5 28.5H9.2" stroke={spark} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export const BRISK_SVG = (tile = "#1d2330", spark = "#d4704a") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="${tile}"/><g transform="translate(15 9) skewX(-12)"><path fill="#fff" fill-rule="evenodd" d="${B_PATH}"/></g><path d="M6.5 19.5H11.6M4.5 24H10.4M5.5 28.5H9.2" stroke="${spark}" stroke-width="2.6" stroke-linecap="round"/></svg>`;
