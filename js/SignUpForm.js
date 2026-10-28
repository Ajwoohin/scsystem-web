import { PasswordToggle } from './PasswordToggle.js';
import { TermsModal } from './TermsModal.js';
import { Validator } from './Validator.js';

// Runs the whole sign-up form: rules, terms pop-up, and sending to Supabase.
export class SignUpForm {
  #form;
  #auth;
  #terms;
  #fields;
  #agree;
  #submitButton;
  #submitLabel;
  #message;
  #hasReadTerms = false;
  #loading = false;

  constructor(form, authService) {
    this.#form = form;
    this.#auth = authService;

    this.#fields = {
      fullName: form.querySelector('#fullName'),
      edp: form.querySelector('#edp'),
      email: form.querySelector('#email'),
      password: form.querySelector('#password'),
      confirmPassword: form.querySelector('#confirmPassword'),
    };
    this.#agree = form.querySelector('#agree');
    this.#submitButton = form.querySelector('#submitBtn');
    this.#submitLabel = this.#submitButton.textContent;
    this.#message = form.querySelector('#formMessage');

    new PasswordToggle(this.#fields.password, document.getElementById('togglePassword'));
    new PasswordToggle(this.#fields.confirmPassword, document.getElementById('toggleConfirm'));

    this.#terms = new TermsModal('termsDialog', () => this.#onTermsAccepted());
    document.getElementById('termsLink').addEventListener('click', () => this.#terms.open());

    this.#agree.addEventListener('click', (event) => this.#onAgreeClick(event));
    this.#fields.edp.addEventListener('input', () => this.#updateRoleHint());
    form.addEventListener('submit', (event) => this.#onSubmit(event));
    this.#updateRoleHint();

    this.#updateSubmitState();
  }

  // The box can only be ticked after the terms were opened and read.
  #onAgreeClick(event) {
    if (!this.#hasReadTerms) {
      event.preventDefault();
      this.#terms.open();
      return;
    }
    this.#updateSubmitState();
  }

  #onTermsAccepted() {
    this.#hasReadTerms = true;
    this.#agree.checked = true;
    this.#updateSubmitState();
  }

  #updateSubmitState() {
    this.#submitButton.disabled = this.#loading || !this.#agree.checked;
  }

  #readValues() {
    return {
      fullName: this.#fields.fullName.value.trim().replace(/\s+/g, ' '),
      edpNumber: this.#fields.edp.value.trim(),
      email: this.#fields.email.value.trim().toLowerCase(),
      password: this.#fields.password.value,
      confirmPassword: this.#fields.confirmPassword.value,
    };
  }

  // Returns an object like { email: 'message' }. Empty object means all good.
  #validate(v) {
    const errors = {};

    if (!v.fullName) errors.fullName = 'Please enter your full name.';

    if (!v.edpNumber) {
      errors.edp = 'Please enter your EDP number.';
    }

    if (!v.email) {
      errors.email = 'Please enter your institutional email.';
    } else if (!Validator.isValidEmail(v.email)) {
      errors.email = 'Please enter a valid email address.';
    } else if (v.edpNumber !== '000' && !Validator.isInstitutionalEmail(v.email)) {
      errors.email = 'Students must use a valid @sccpag.edu.ph institutional email.';
    }

    if (!v.password) {
      errors.password = 'Please enter a password.';
    } else if (!Validator.hasMinLength(v.password, 8)) {
      errors.password = 'Password must be at least 8 characters.';
    } else if (!Validator.hasSpecialCharacter(v.password)) {
      errors.password = 'Password must include at least one special character (e.g. ! @ # $).';
    }

    if (v.password && v.password !== v.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    return errors;
  }

  #showErrors(errors) {
    let firstField = null;
    for (const [name, text] of Object.entries(errors)) {
      const slot = this.#form.querySelector(`[data-error-for="${name}"]`);
      slot.textContent = text; // textContent keeps it safe from injected HTML
      slot.closest('.field').classList.add('has-error');
      firstField ??= this.#fields[name];
    }
    firstField?.focus();
  }

  #clearErrors() {
    this.#form.querySelectorAll('.error').forEach((el) => { el.textContent = ''; });
    this.#form.querySelectorAll('.field').forEach((el) => el.classList.remove('has-error'));
    this.#message.hidden = true;
    this.#message.textContent = '';
  }

  #setLoading(isLoading) {
    this.#loading = isLoading;
    this.#submitButton.textContent = isLoading ? 'Creating account...' : this.#submitLabel;
    this.#updateSubmitState();
  }

  async #onSubmit(event) {
    event.preventDefault();
    if (this.#loading) return;

    this.#clearErrors();
    const values = this.#readValues();
    const errors = this.#validate(values);
    if (Object.keys(errors).length > 0) {
      this.#showErrors(errors);
      return;
    }

    this.#setLoading(true);
    const result = await this.#auth.signUpStudent(values);
    this.#setLoading(false);

    if (!result.ok) {
      this.#message.textContent = result.message;
      this.#message.hidden = false;
      return;
    }
    this.#showSuccess(values.email, result.needsVerification, result.isStaff);
  }

  #updateRoleHint() {
    const isStaff = this.#fields.edp.value.trim() === '000';
    const emailLabel = document.querySelector('label[for="email"]');
    const emailInput = this.#fields.email;
    const emailHint = document.getElementById('emailHint');
    emailLabel.textContent = isStaff ? 'Staff Email' : 'Institutional Email (@sccpag.edu.ph)';
    emailInput.placeholder = isStaff ? 'your.email@example.com' : 'name@sccpag.edu.ph';
    emailHint.textContent = isStaff
      ? 'EDP 000 sends a staff registration request for administrator approval.'
      : 'Students must use their @sccpag.edu.ph institutional email.';
  }

  #showSuccess(email, needsVerification, isStaff) {
    document.getElementById('formArea').hidden = true;
    document.getElementById('successTitle').textContent = needsVerification
      ? 'Verify your email'
      : (isStaff ? 'Staff request submitted' : 'Account created');
    document.getElementById('successText').textContent = needsVerification
      ? `We sent a confirmation link to ${email}. Open it, then log in. ${isStaff ? 'Your staff account will still need administrator approval.' : ''}`
      : (isStaff
          ? 'Your staff account has been created and is waiting for administrator approval.'
          : 'Your account is ready. You can log in now.');
    document.getElementById('successPanel').hidden = false;
  }
}
