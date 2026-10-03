const THEME_EDIT_CODE = "3001";

/**
 * Checks the Edit themes code for this visit.
 *
 * @param value - Code typed into the lock
 * @returns Whether the code opens Edit themes
 */
const themeCodeMatches = (value: string) => value.trim() === THEME_EDIT_CODE;

export { themeCodeMatches };
