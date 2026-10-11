export interface PasswordEvaluation {
  val: string;
  checks: {
    length: boolean;
    lower: boolean;
    upper: boolean;
    number: boolean;
    special: boolean;
  };
  validCount: number;
  isValid: boolean;
  strength: 'none' | 'weak' | 'fair' | 'good' | 'strong';
  label: string;
  activeSegments: number;
}

export function evaluatePassword(pw: string): PasswordEvaluation {
  const val = typeof pw === 'string' ? pw : '';
  const checks = {
    length: val.length >= 8 && val.length <= 128,
    lower: /[a-z]/.test(val),
    upper: /[A-Z]/.test(val),
    number: /[0-9]/.test(val),
    special: /[^a-zA-Z0-9]/.test(val),
  };
  const validCount = Object.values(checks).filter(Boolean).length;
  const isValid = validCount === 5;

  let strength: 'none' | 'weak' | 'fair' | 'good' | 'strong' = 'none';
  let label = 'Required';
  let activeSegments = 0;

  if (val.length > 0) {
    if (validCount <= 2) {
      strength = 'weak';
      label = 'Weak';
      activeSegments = 1;
    } else if (validCount === 3) {
      strength = 'fair';
      label = 'Fair';
      activeSegments = 2;
    } else if (validCount === 4) {
      strength = 'good';
      label = 'Good';
      activeSegments = 3;
    } else if (validCount === 5) {
      strength = 'strong';
      label = 'Strong';
      activeSegments = 4;
    }
  }

  return { val, checks, validCount, isValid, strength, label, activeSegments };
}

export function generateSecurePassword(): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = lowercase + uppercase + numbers + symbols;

  const getSecureChar = (set: string): string => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return set[arr[0] % set.length];
    }
    return set[Math.floor(Math.random() * set.length)];
  };

  const chars: string[] = [
    getSecureChar(uppercase),
    getSecureChar(uppercase),
    getSecureChar(lowercase),
    getSecureChar(lowercase),
    getSecureChar(numbers),
    getSecureChar(numbers),
    getSecureChar(symbols),
    getSecureChar(symbols),
  ];

  while (chars.length < 16) {
    chars.push(getSecureChar(all));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    let j: number;
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      j = arr[0] % (i + 1);
    } else {
      j = Math.floor(Math.random() * (i + 1));
    }
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join('');
}
