import { PasswordToggle } from './PasswordToggle.js';
import { TermsModal } from './TermsModal.js';
import { Validator } from './Validator.js';

export class SignUpForm {
  #form;
  #auth;
  #fields;
  #agree;
  #submitButton;
  #submitLabel;
  #message;
  #terms;
  #role = 'student';
  #hasReadTerms = false;
  #loading = false;

  constructor(form, authService) {
    this.#form = form;
    this.#auth = authService;
    this.#fields = {
      firstName: form.querySelector('#firstName'),
      middleName: form.querySelector('#middleName'),
      lastName: form.querySelector('#lastName'),
      course: form.querySelector('#course'),
      edp: form.querySelector('#edp'),
      email: form.querySelector('#email'),
      password: form.querySelector('#password'),
      confirmPassword: form.querySelector('#confirmPassword'),
    };
    this.#agree = form.querySelector('#agree');
    this.#submitButton = form.querySelector('#submitBtn');
    this.#submitLabel = this.#submitButton.textContent;
    this.#message = form.querySelector('#formMessage');
    this.#terms = new TermsModal('termsDialog', () => this.#onTermsAccepted());

    new PasswordToggle(this.#fields.password, document.getElementById('togglePassword'));
    new PasswordToggle(this.#fields.confirmPassword, document.getElementById('toggleConfirm'));
    document.getElementById('termsLink').addEventListener('click', () => this.#terms.open());
    this.#agree.addEventListener('click', (event) => this.#onAgreeClick(event));
    form.addEventListener('submit', (event) => this.#onSubmit(event));
    this.#setRole(new URLSearchParams(location.search).get('type') === 'teacher' ? 'teacher' : 'student');
    this.#updateSubmitState();
  }

  #setRole(role) {
    this.#role = role === 'teacher' ? 'teacher' : 'student';
    document.querySelectorAll('[data-student-only]').forEach((field) => { field.hidden = this.#role !== 'student'; });
    const roleSwitch = document.getElementById('roleSwitch');
    roleSwitch.innerHTML = this.#role === 'teacher'
      ? 'Signing up as a student? <a class="btn btn-secondary btn-sm" href="register.html">Student Sign Up</a>'
      : 'Are you a teacher? <a class="btn btn-secondary btn-sm" href="register.html?type=teacher">Teacher Sign Up</a>';
    document.getElementById('signupTitle').textContent = this.#role === 'teacher' ? 'Teacher Sign Up' : 'Student Sign Up';
    document.getElementById('signupSubtitle').textContent = this.#role === 'teacher'
      ? 'Create a teacher account using your personal Gmail address.'
      : 'Create your student account using your SCC institutional email.';
    document.getElementById('emailLabel').textContent = this.#role === 'teacher' ? 'Personal Gmail' : 'Institutional Email (@sccpag.edu.ph)';
    this.#fields.email.placeholder = this.#role === 'teacher' ? 'yourname@gmail.com' : 'name@sccpag.edu.ph';
    document.getElementById('emailHint').textContent = this.#role === 'teacher'
      ? 'Teachers must use a personal @gmail.com address. New accounts need administrator approval.'
      : 'Students must use their @sccpag.edu.ph institutional email.';
    this.#submitLabel = this.#role === 'teacher' ? 'Create Teacher Account' : 'Create Student Account';
    this.#submitButton.textContent = this.#submitLabel;
    this.#clearErrors();
  }

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
      firstName: this.#fields.firstName.value.trim().replace(/\s+/g, ' '),
      middleName: this.#fields.middleName.value.trim().replace(/\s+/g, ' '),
      lastName: this.#fields.lastName.value.trim().replace(/\s+/g, ' '),
      course: this.#fields.course.value,
      edpNumber: this.#fields.edp.value.trim(),
      email: this.#fields.email.value.trim().toLowerCase(),
      password: this.#fields.password.value,
      confirmPassword: this.#fields.confirmPassword.value,
    };
  }

  #validate(values) {
    const errors = {};
    if (!values.firstName) errors.firstName = 'Please enter your first name.';
    if (!values.lastName) errors.lastName = 'Please enter your last name.';

    if (this.#role === 'student') {
      if (!values.course) errors.course = 'Please select your course.';
      if (!values.edpNumber) errors.edp = 'Please enter your EDP number.';
      if (!values.email) errors.email = 'Please enter your institutional email.';
      else if (!Validator.isInstitutionalEmail(values.email)) errors.email = 'Use a valid @sccpag.edu.ph institutional email.';
    } else {
      if (!values.email) errors.email = 'Please enter your Gmail address.';
      else if (!Validator.isEmail(values.email) || !values.email.endsWith('@gmail.com')) errors.email = 'Use a valid personal @gmail.com address.';
    }

    if (!values.password) errors.password = 'Please enter a password.';
    else if (!Validator.hasMinLength(values.password, 8)) errors.password = 'Password must be at least 8 characters.';
    else if (!Validator.hasSpecialCharacter(values.password)) errors.password = 'Password must include at least one special character.';
    if (!values.confirmPassword) errors.confirmPassword = 'Please confirm your password.';
    else if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    return errors;
  }

  #showErrors(errors) {
    let firstField = null;
    for (const [name, message] of Object.entries(errors)) {
      const slot = this.#form.querySelector(`[data-error-for="${name}"]`);
      const field = slot?.closest('.field');
      if (slot) slot.textContent = message;
      field?.classList.add('has-error');
      firstField ??= this.#fields[name];
    }
    firstField?.focus();
  }

  #clearErrors() {
    this.#form.querySelectorAll('.error').forEach((slot) => { slot.textContent = ''; });
    this.#form.querySelectorAll('.field').forEach((field) => field.classList.remove('has-error'));
    this.#message.hidden = true;
    this.#message.textContent = '';
  }

  #setLoading(loading) {
    this.#loading = loading;
    this.#submitButton.textContent = loading ? 'Creating account...' : this.#submitLabel;
    this.#updateSubmitState();
  }

  async #onSubmit(event) {
    event.preventDefault();
    if (this.#loading) return;
    this.#clearErrors();
    const values = this.#readValues();
    const errors = this.#validate(values);
    if (Object.keys(errors).length) {
      this.#showErrors(errors);
      return;
    }

    this.#setLoading(true);
    let result;
    try {
      result = this.#role === 'teacher'
        ? await this.#auth.signUpStaff(values)
        : await this.#auth.signUpStudent(values);
    } catch (error) {
      result = { ok: false, message: error.message || 'Could not create your account. Please try again.' };
    } finally {
      this.#setLoading(false);
    }

    if (!result.ok) {
      this.#message.textContent = result.message;
      this.#message.hidden = false;
      return;
    }
    this.#showSuccess(values.email, result.needsVerification, this.#role === 'teacher');
  }

  #showSuccess(email, needsVerification, isTeacher) {
    document.getElementById('formArea').hidden = true;
    document.getElementById('successTitle').textContent = needsVerification ? 'Verify your email' : (isTeacher ? 'Teacher request submitted' : 'Account created');
    document.getElementById('successText').textContent = needsVerification
      ? `A confirmation link was sent to ${email}. Confirm your email, then log in.${isTeacher ? ' Your teacher account will still need administrator approval.' : ''}`
      : (isTeacher ? 'Your teacher account has been created and is waiting for administrator approval.' : 'Your student account is ready. You can log in now.');
    document.getElementById('successPanel').hidden = false;
  }
}
