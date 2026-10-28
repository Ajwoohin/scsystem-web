// Static helper methods. These are the same rules the Android app uses.
export class Validator {
  static #EMAIL = /^[a-z0-9._%+-]+@sccpag\.edu\.ph$/;
  static #SPECIAL = /[!@#$%^&*(),.?":{}|<>_\-]/;

  static isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Expects an email that is already trimmed and lowercase.
  static isInstitutionalEmail(email) {
    return Validator.#EMAIL.test(email);
  }

  static hasMinLength(text, min = 8) {
    return text.length >= min;
  }

  static hasSpecialCharacter(text) {
    return Validator.#SPECIAL.test(text);
  }
}
