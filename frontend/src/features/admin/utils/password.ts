export interface PasswordCriterion {
  id: string;
  label: string;
  test: (val: string) => boolean;
}

export const PASSWORD_CRITERIA: PasswordCriterion[] = [
  { id: 'length', label: 'At least 8 characters (max 128)', test: (v) => v.length >= 8 && v.length <= 128 },
  { id: 'upper', label: 'At least one uppercase letter (A–Z)', test: (v) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'At least one lowercase letter (a–z)', test: (v) => /[a-z]/.test(v) },
  { id: 'number', label: 'At least one number (0–9)', test: (v) => /[0-9]/.test(v) },
  { id: 'special', label: 'At least one special character (!@#$%^&*)', test: (v) => /[^a-zA-Z0-9]/.test(v) },
];

export function generateSecurePassword(length = 16): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%^&*()_+~|}{[]:;?><,.-=';
  const allChars = uppers + lowers + digits + specials;

  const getRandom = (str: string) => {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const index = (array[0] ?? 0) % str.length;
    return str[index] ?? str[0] ?? 'a';
  };

  // Ensure at least two of each mandatory class
  const required = [
    getRandom(uppers),
    getRandom(uppers),
    getRandom(lowers),
    getRandom(lowers),
    getRandom(digits),
    getRandom(digits),
    getRandom(specials),
    getRandom(specials),
  ];

  while (required.length < length) {
    required.push(getRandom(allChars));
  }

  // Shuffle Fisher-Yates
  for (let i = required.length - 1; i > 0; i--) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const j = (array[0] ?? 0) % (i + 1);
    const temp = required[i] ?? '';
    required[i] = required[j] ?? '';
    required[j] = temp;
  }

  return required.join('');
}
