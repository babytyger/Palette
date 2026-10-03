/**
 * Palette mark traced from Palette Logo Full-03: two offset gradient blocks.
 */
const Logo = () => (
  <svg className="logo" viewBox="0 0 61 86" aria-hidden="true">
    <defs>
      <linearGradient id="palette-mark-top" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0077f1" />
        <stop offset="42%" stopColor="#01c6fc" />
        <stop offset="72%" stopColor="#59d6e4" />
        <stop offset="100%" stopColor="#10bf27" />
      </linearGradient>
      <linearGradient id="palette-mark-bottom" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#21d176" />
        <stop offset="38%" stopColor="#f0b704" />
        <stop offset="68%" stopColor="#fc6d38" />
        <stop offset="100%" stopColor="#fc98a9" />
      </linearGradient>
    </defs>
    <path fill="url(#palette-mark-top)" d="M0 0H61V43H30V19H0Z" />
    <path fill="url(#palette-mark-bottom)" d="M0 44H31V86H0Z" />
  </svg>
);

export { Logo };
