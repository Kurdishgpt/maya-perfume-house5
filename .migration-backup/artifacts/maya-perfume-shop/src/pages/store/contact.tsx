import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPublicContactSettingsQueryKey,
  useGetPublicContactSettings,
  useSubmitContactMessage,
  type ContactMessageInput,
} from "@workspace/api-client-react";
import { ArrowUpRight, Check, Clock3, Flower2, Mail, MapPin, MessageSquareText, Phone, Send, UserRound } from "lucide-react";
import { CONTACT_CONFIG } from "@/lib/contact-config";
import { useStore } from "@/lib/store-context";

type ContactFormState = Omit<ContactMessageInput, "subject"> & { subject: ContactMessageInput["subject"] | "" };

const blankForm: ContactFormState = {
  full_name: "", email: "", phone: "", subject: "", message: "",
};

export default function ContactPage() {
  const { t } = useStore();
  const queryClient = useQueryClient();
  const settings = useGetPublicContactSettings({
    query: { queryKey: getGetPublicContactSettingsQueryKey(), staleTime: 60_000 },
  });
  const submitMessage = useSubmitContactMessage();
  const [form, setForm] = useState<ContactFormState>(blankForm);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; key: string } | null>(null);
  const [formError, setFormError] = useState("");
  const [emailUser, emailDomain] = CONTACT_CONFIG.email.split("@");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setFormError("");
    if (!form.subject) return setFormError('contactChooseSubject');
    const payload: ContactMessageInput = {
      ...form,
      subject: form.subject as ContactMessageInput["subject"],
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone?.trim() || null,
      message: form.message.trim(),
    };
    if (payload.full_name.length < 2) return setFormError('contactNameError');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return setFormError('contactEmailError');
    if (payload.message.length < 10) return setFormError('contactMessageShort');
    if (payload.message.length > 2000) return setFormError('contactMessageLong');
    if (payload.phone && !/^[+0-9() .-]{0,32}$/.test(payload.phone)) return setFormError('contactPhoneError');
    try {
      const received = await submitMessage.mutateAsync({ data: payload });
      if (received.received) {
        setForm(blankForm);
        setNotice({ tone: "success", key: 'contactSuccess' });
        await queryClient.invalidateQueries({ queryKey: getGetPublicContactSettingsQueryKey() });
      } else {
        setNotice({ tone: "error", key: 'contactNotStoredError' });
      }
    } catch {
      setNotice({ tone: "error", key: 'contactError' });
    }
  };
  const set = (key: keyof ContactFormState, value: string) => setForm((current) => ({ ...current, [key]: value }) as ContactFormState);

  return <main className="mc-page mc-contact" data-testid="page-contact">
    <section className="mc-contact-hero">
      <img src="/images/hero-bottle.jpg" alt={t('contactHeroImageAlt')} className="mc-contact-hero-image"/>
      <div className="mc-contact-hero-shade"/>
      <div className="mc-contact-hero-copy">
        <span className="mc-kicker">{t('contactEyebrow')}</span>
        <span className="mc-contact-rule"/>
        <h1>{t('contactPageTitle')}</h1>
        <p>{t('contactHeroBody')}</p>
      </div>
      <Flower2 className="mc-contact-flower" aria-hidden="true"/>
    </section>

    <section className="mc-contact-ways" aria-label={t('contactDetails')}>
      <article className="mc-contact-card">
        <span className="mc-contact-icon"><Phone/></span><h2>{t('contactPhone')}</h2>
        <a className="mc-contact-detail" dir="ltr" href={CONTACT_CONFIG.phoneHref}>{CONTACT_CONFIG.phone}</a>
        <p>{t('contactPhoneDescription')}</p>
        <a className="mc-contact-card-action" dir="ltr" href={CONTACT_CONFIG.phoneHref}><Phone/>{t('callNow')}</a>
      </article>
      <article className="mc-contact-card">
        <span className="mc-contact-icon"><Mail/></span><h2>{t('contactEmail')}</h2>
        <a className="mc-contact-detail" dir="ltr" aria-label={CONTACT_CONFIG.email} href={`mailto:${CONTACT_CONFIG.email}`}>{emailUser}@<wbr/>{emailDomain}</a>
        <p>{t('contactEmailDescription')}</p>
        <a className="mc-contact-card-action" href={`mailto:${CONTACT_CONFIG.email}`}><Mail/>{t('sendEmail')}</a>
      </article>
      <article className="mc-contact-card">
        <span className="mc-contact-icon"><MapPin/></span><h2>{t('ourLocation')}</h2>
        <p className="mc-contact-location-note">{t('visitStore')}</p>
        <a className="mc-contact-card-action" href={CONTACT_CONFIG.mapUrl} target="_blank" rel="noreferrer"><MapPin/>{t('getDirections')}</a>
      </article>
    </section>

    <section className="mc-contact-form-card">
      <div className="mc-contact-section-heading"><Flower2 aria-hidden="true"/><div><h2>{t('contactFormTitle')}</h2><p>{t('contactFormLead')}</p></div></div>
      <form className="mc-contact-form" onSubmit={submit} noValidate>
        <label className="mc-contact-field"><UserRound/><span className="sr-only">{t('fullNameRequired')}</span><input autoComplete="name" required minLength={2} maxLength={100} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder={t('fullNameRequired')} data-testid="input-contact-name"/></label>
        <label className="mc-contact-field"><Mail/><span className="sr-only">{t('emailRequired')}</span><input type="email" dir="ltr" autoComplete="email" required maxLength={254} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder={t('emailRequired')} data-testid="input-contact-email"/></label>
        <label className="mc-contact-field mc-contact-field-wide"><Phone/><span className="sr-only">{t('phoneOptional')}</span><input type="tel" dir="ltr" autoComplete="tel" maxLength={32} value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder={t('phoneOptional')} data-testid="input-contact-phone"/></label>
        <label className="mc-contact-field mc-contact-field-wide"><MessageSquareText/><span className="sr-only">{t('subjectRequired')}</span><select required value={form.subject} onChange={(e) => set("subject", e.target.value as ContactMessageInput["subject"])} data-testid="select-contact-subject">
         <option value="">{t('subjectRequired')}</option><option value="product">{t('subjectProduct')}</option><option value="order">{t('subjectOrder')}</option><option value="feedback">{t('subjectFeedback')}</option><option value="store_info">{t('subjectStoreInfo')}</option><option value="other">{t('subjectOther')}</option>
        </select></label>
        <label className="mc-contact-field mc-contact-message"><MessageSquareText/><span className="sr-only">{t('messageRequired')}</span><textarea required minLength={10} maxLength={2000} value={form.message} onChange={(e) => set("message", e.target.value)} placeholder={t('messageRequired')} data-testid="textarea-contact-message"/></label>
        {formError && <p className="mc-contact-error" role="alert">{t(formError)}</p>}
        {notice && <p className={`mc-contact-notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"} data-testid={`status-contact-${notice.tone}`}>{notice.tone === "success" ? <Check/> : null}{t(notice.key)}</p>}
        <button className="mc-contact-submit" type="submit" disabled={submitMessage.isPending} data-testid="button-submit-contact">
          {submitMessage.isPending ? <><span className="mc-contact-submit-pulse"/>{t('savingMessage')}</> : <><Send/>{t('sendMessage')}</>}
        </button>
         <p className="mc-contact-private-note">{t('contactPrivateNote')}</p>
      </form>
    </section>

    <section className="mc-contact-map-card">
       <div className="mc-contact-section-heading"><span className="mc-contact-icon is-small"><MapPin/></span><div><h2>{t('mapTitle')}</h2><p>{t('mapDescription')}</p></div></div>
      <div className="mc-map-preview">
        <img src={CONTACT_CONFIG.mapPreviewImage} alt={t('mapDescription')} loading="lazy"/>
        <span className="mc-map-pin" aria-label={t('verifiedLocation')}><MapPin size={30} fill="currentColor"/></span>
        <a className="mc-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
      </div>
       <a className="mc-map-directions" href={CONTACT_CONFIG.mapUrl} target="_blank" rel="noreferrer"><Send/>{t('openGoogleMaps')}<ArrowUpRight/></a>
    </section>

    <section className="mc-contact-hours" aria-live="polite">
      <span className="mc-contact-hours-icon"><Clock3/></span>
      <div className="mc-contact-hours-copy"><h2>{t('storeHoursTitle')}</h2>
        {settings.isLoading ? <div className="mc-hours-skeleton" aria-label={t('hoursLoading')}/> :
          settings.isError ? <div className="mc-hours-error"><p>{t('hoursUnavailable')}</p><button type="button" onClick={() => void settings.refetch()} disabled={settings.isFetching}>{t('retry')}</button></div> :
          settings.data?.store_hours?.trim() ? <p className="mc-hours-value">{settings.data.store_hours}</p> : <p className="mc-hours-unset">{t('hoursUnset')}</p>}
      </div>
      <div className="mc-hours-bloom" aria-hidden="true"><Flower2/><span>{t('beautyEveryMoment')}</span></div>
    </section>
  </main>;
}
