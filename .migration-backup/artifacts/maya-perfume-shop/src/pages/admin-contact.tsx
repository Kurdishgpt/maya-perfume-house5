import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminContactSettingsQueryKey,
  getListAdminContactMessagesQueryKey,
  useDeleteAdminContactMessage,
  useGetAdminContactSettings,
  useListAdminContactMessages,
  useUpdateAdminContactMessage,
  useUpdateAdminContactSettings,
  type ContactMessage,
} from "@workspace/api-client-react";
import { Check, Clock3, Inbox, Mail, Phone, RefreshCw, Trash2 } from "lucide-react";

const errorText = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
const formatDate = (date: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

export default function AdminContact() {
  const client = useQueryClient();
  const messages = useListAdminContactMessages({ query: { queryKey: getListAdminContactMessagesQueryKey(), refetchOnWindowFocus: true, staleTime: 15_000 } });
  const settings = useGetAdminContactSettings({ query: { queryKey: getGetAdminContactSettingsQueryKey(), staleTime: 30_000 } });
  const saveSettings = useUpdateAdminContactSettings();
  const updateMessage = useUpdateAdminContactMessage();
  const deleteMessage = useDeleteAdminContactMessage();
  const [hours, setHours] = useState("");
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [toast, setToast] = useState<{ error: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => { setHours(settings.data?.store_hours ?? ""); }, [settings.data?.store_hours]);
  const notify = (error: boolean, text: string) => { setToast({ error, text }); window.setTimeout(() => setToast(null), 4000); };
  const refreshMessages = () => client.invalidateQueries({ queryKey: getListAdminContactMessagesQueryKey() });
  const refreshSettings = () => client.invalidateQueries({ queryKey: getGetAdminContactSettingsQueryKey() });
  const saveHours = async (value: string) => {
    try {
      await saveSettings.mutateAsync({ data: { store_hours: value.trim() || null } });
      await refreshSettings();
      notify(false, value.trim() ? "Store hours saved and published." : "Store hours cleared.");
    } catch (error) { notify(true, errorText(error)); }
  };
  const markRead = async (message: ContactMessage) => {
    setSelected(message);
    if (message.is_read) return;
    try {
      await updateMessage.mutateAsync({ id: message.id, data: { is_read: true } });
      setSelected({ ...message, is_read: true });
      await refreshMessages();
    } catch (error) { notify(true, `Could not mark this message as read. ${errorText(error)}`); }
  };
  const toggleRead = async (message: ContactMessage) => {
    try {
      await updateMessage.mutateAsync({ id: message.id, data: { is_read: !message.is_read } });
      await refreshMessages();
      if (selected?.id === message.id) setSelected({ ...message, is_read: !message.is_read });
      notify(false, message.is_read ? "Message marked unread." : "Message marked read.");
    } catch (error) { notify(true, errorText(error)); }
  };
  const removeMessage = async () => {
    if (confirmDelete === null) return;
    try {
      await deleteMessage.mutateAsync({ id: confirmDelete });
      if (selected?.id === confirmDelete) setSelected(null);
      setConfirmDelete(null);
      await refreshMessages();
      notify(false, "Message permanently deleted.");
    } catch (error) { notify(true, errorText(error)); }
  };

  return <section className="mc-admin-contact" data-testid="admin-contact">
    <div className="mc-admin-contact-heading"><div><span className="mc-admin-contact-kicker">CUSTOMER CARE · MAYA COLLECTION</span><h1>Inbox &amp; store hours</h1><p>Private enquiries from your customers, and the hours shown on the storefront.</p></div>
      <button className="mc-admin-contact-refresh" onClick={() => { void messages.refetch(); void settings.refetch(); }} disabled={messages.isFetching || settings.isFetching} data-testid="button-refresh-contact"><RefreshCw size={15}/>Refresh</button>
    </div>
    <section className="mc-admin-hours">
      <div className="mc-admin-hours-title"><span><Clock3/></span><div><h2>Store hours</h2><p>Displayed publicly on the Contact Us page. Leave blank to clear.</p></div></div>
      {settings.isLoading ? <div className="mc-admin-skeleton"/> : settings.isError ? <div className="mc-admin-inline-error" role="alert">Couldn’t load contact settings. <button onClick={() => void settings.refetch()}>Retry</button></div> :
        <><label className="sr-only" htmlFor="admin-store-hours">Store hours</label><textarea id="admin-store-hours" rows={3} maxLength={1000} value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Enter confirmed opening days and hours" data-testid="textarea-store-hours"/><div className="mc-admin-hours-actions"><span>{hours.length}/1,000 characters</span><div><button className="mc-admin-clear" onClick={() => { setHours(""); void saveHours(""); }} disabled={saveSettings.isPending || !settings.data?.store_hours} data-testid="button-clear-store-hours">Clear hours</button><button className="mc-admin-save" onClick={() => void saveHours(hours)} disabled={saveSettings.isPending || hours === (settings.data?.store_hours ?? "")} data-testid="button-save-store-hours">{saveSettings.isPending ? "Saving…" : "Save hours"}</button></div></div></>}
    </section>

    <div className="mc-admin-inbox-head"><div><span className="mc-admin-contact-kicker">PRIVATE ADMIN INBOX</span><h2>Customer messages <span>{messages.data?.length ?? 0}</span></h2></div></div>
    {messages.isLoading ? <div className="mc-admin-message-skeletons">{[0,1,2].map((n)=><div key={n}/>)}</div> :
      messages.isError ? <div className="mc-admin-contact-state" role="alert"><Inbox/><h3>Inbox unavailable</h3><p>{errorText(messages.error)}</p><button onClick={() => void messages.refetch()} data-testid="button-retry-contact-inbox">Try again</button></div> :
      !messages.data?.length ? <div className="mc-admin-contact-state"><Inbox/><h3>Your inbox is quiet</h3><p>New customer enquiries will be collected here, never on the public storefront.</p></div> :
      <div className="mc-admin-inbox-layout">
        <div className="mc-admin-message-list" aria-label="Customer messages">
          {messages.data.map((message) => <button className={`mc-admin-message-row${message.is_read ? "" : " is-unread"}${selected?.id === message.id ? " is-selected" : ""}`} key={message.id} onClick={() => void markRead(message)} data-testid={`message-row-${message.id}`}>
            <span className="mc-admin-message-dot" aria-hidden="true"/><span className="mc-admin-message-row-copy"><strong>{message.full_name}</strong><span>{message.subject.replace("_", " ")} · {message.email}</span><span>{message.message}</span></span><time>{formatDate(message.created_at)}</time>
          </button>)}
        </div>
        {selected && <article className="mc-admin-message-detail">
          <div className="mc-admin-detail-top"><div><span className="mc-admin-contact-kicker">{selected.subject.replace("_", " ")}</span><h3>{selected.full_name}</h3><time>{formatDate(selected.created_at)}</time></div><button onClick={() => setSelected(null)} aria-label="Close message" data-testid="button-close-message">×</button></div>
          <div className="mc-admin-detail-contact"><a href={`mailto:${selected.email}`}><Mail/>{selected.email}</a>{selected.phone && <a href={`tel:${selected.phone}`}><Phone/>{selected.phone}</a>}</div>
          <p className="mc-admin-detail-body">{selected.message}</p>
          <div className="mc-admin-detail-actions"><button onClick={() => void toggleRead(selected)} disabled={updateMessage.isPending} data-testid="button-toggle-message-read"><Check/>{selected.is_read ? "Mark unread" : "Mark read"}</button><button className="is-delete" onClick={() => setConfirmDelete(selected.id)} data-testid="button-delete-contact-message"><Trash2/>Delete</button></div>
        </article>}
      </div>}
    {toast && <div className={`mc-admin-contact-toast${toast.error ? " is-error" : ""}`} role={toast.error ? "alert" : "status"}>{toast.text}</div>}
    {confirmDelete !== null && <div className="mc-admin-confirm-backdrop" role="presentation"><section className="mc-admin-confirm" role="alertdialog" aria-modal="true" aria-labelledby="contact-delete-title"><h3 id="contact-delete-title">Delete this message?</h3><p>This permanently removes the enquiry from your private inbox.</p><div><button onClick={() => setConfirmDelete(null)} disabled={deleteMessage.isPending} data-testid="button-cancel-contact-delete">Keep message</button><button className="is-delete" onClick={() => void removeMessage()} disabled={deleteMessage.isPending} data-testid="button-confirm-contact-delete">{deleteMessage.isPending ? "Deleting…" : "Delete message"}</button></div></section></div>}
  </section>;
}
