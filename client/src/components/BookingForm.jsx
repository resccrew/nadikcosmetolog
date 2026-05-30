import { useState } from 'react';
import { submitBooking } from '../lib/api.js';

const initial = { name: '', phone: '', email: '', message: '' };

// Маска телефона: оставляем + и цифры
function formatPhone(v) {
  const cleaned = v.replace(/[^\d+]/g, '');
  return cleaned.startsWith('+') ? '+' + cleaned.slice(1).replace(/\+/g, '') : cleaned;
}

export default function BookingForm() {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [serverError, setServerError] = useState('');

  function validate() {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Укажите имя';
    if (form.phone.replace(/\D/g, '').length < 7) e.phone = 'Укажите телефон';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Некорректный email';
    return e;
  }

  function handleChange(field, value) {
    setForm((f) => ({ ...f, [field]: field === 'phone' ? formatPhone(value) : value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setStatus('sending');
    setServerError('');
    const res = await submitBooking(form);
    if (res.ok) {
      setStatus('success');
      setForm(initial);
    } else {
      if (res.errors) setErrors(res.errors);
      setServerError(res.error || 'Не удалось отправить');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="booking-success">
        <div className="booking-success-icon">✓</div>
        <h3>Заявка отправлена</h3>
        <p>Я свяжусь с вами в ближайшее время. Спасибо за доверие!</p>
        <button className="btn-primary" onClick={() => setStatus('idle')}>
          Отправить ещё одну
        </button>
      </div>
    );
  }

  return (
    <form className="booking-form" onSubmit={handleSubmit} noValidate>
      {/* honeypot для ботов — скрыт от людей */}
      <input
        type="text"
        name="_honey"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px' }}
        aria-hidden="true"
        onChange={(e) => setForm((f) => ({ ...f, _honey: e.target.value }))}
      />

      <div className={`field ${errors.name ? 'field--error' : ''}`}>
        <label>Имя *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="Как вас зовут"
        />
        {errors.name && <span className="field-err">{errors.name}</span>}
      </div>

      <div className={`field ${errors.phone ? 'field--error' : ''}`}>
        <label>Телефон *</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          placeholder="+7 900 000 00 00"
        />
        {errors.phone && <span className="field-err">{errors.phone}</span>}
      </div>

      <div className={`field ${errors.email ? 'field--error' : ''}`}>
        <label>Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="you@example.com"
        />
        {errors.email && <span className="field-err">{errors.email}</span>}
      </div>

      <div className="field">
        <label>Ваш запрос</label>
        <textarea
          rows={3}
          value={form.message}
          onChange={(e) => handleChange('message', e.target.value)}
          placeholder="Кратко опишите, с чем хотите обратиться"
        />
      </div>

      {serverError && <div className="booking-error">{serverError}</div>}

      <button type="submit" className="btn-primary booking-submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Отправляем…' : 'Записаться на консультацию'}
      </button>
    </form>
  );
}
