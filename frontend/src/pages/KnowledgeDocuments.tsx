import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Input, Textarea, Select, Card, DocumentCard, Alert } from '../components/ui';

const DOC_TYPE_OPTIONS = [
  { value: 'philosophy', label: 'Philosophy' },
  { value: 'sample_week', label: 'Sample Week' },
  { value: 'training_block', label: 'Training Block' },
  { value: 'taper', label: 'Taper' },
  { value: 'injury_rule', label: 'Injury Rule' },
  { value: 'faq', label: 'FAQ' },
  { value: 'notes', label: 'Notes' },
];

type Doc = { id: string; title: string; document_type: string; created_at: string; content_text: string; source_file_name?: string };

export function KnowledgeDocuments() {
  const { profile, clearAuth } = useAuthStore();
  const nav = useNavigate();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  const [form, setForm] = useState({ title: '', document_type: 'sample_week', content_text: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Doc>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const logout = async () => { await supabase.auth.signOut(); clearAuth(); nav('/'); };

  const loadDocs = () => {
    apiFetch('/api/coach/bot/knowledge').then(setDocs).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(loadDocs, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      let text = '';
      if (file.name.endsWith('.txt')) {
        text = await file.text();
      } else if (file.name.endsWith('.docx')) {
        // @ts-ignore
        const mammoth = await import('mammoth');
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        text = result.value;
      } else {
        setError('Only .txt and .docx files are supported');
        return;
      }
      setForm(f => ({ ...f, content_text: text, title: f.title || file.name.replace(/\.[^.]+$/, '') }));
      setMode('paste');
    } catch (err: any) {
      setError('Failed to read file: ' + err.message);
    }
  };

  const save = async () => {
    if (!form.title || !form.content_text) { setError('Title and content are required'); return; }
    setSaving(true); setError('');
    try {
      const doc = await apiFetch('/api/coach/bot/knowledge', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setDocs(prev => [doc, ...prev]);
      setForm({ title: '', document_type: 'sample_week', content_text: '' });
      setSuccess('Document saved!');
      setTimeout(() => setSuccess(''), 3000);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const startEdit = (id: string) => {
    const doc = docs.find(d => d.id === id);
    if (!doc) return;
    setEditingId(id);
    setEditForm({ title: doc.title, document_type: doc.document_type, content_text: doc.content_text });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/api/coach/bot/knowledge/${editingId}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setDocs(prev => prev.map(d => d.id === editingId ? updated : d));
      setEditingId(null);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const deleteDoc = async (id: string) => {
    await apiFetch(`/api/coach/bot/knowledge/${id}`, { method: 'DELETE' });
    setDocs(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div className="min-h-screen">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-2 fade-up">
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">Training Knowledge</h1>
          <Link to="/coach/dashboard"><Button variant="ghost" size="sm">← Dashboard</Button></Link>
        </div>
        <p className="text-sm text-[var(--muted)] mb-8 leading-relaxed fade-up">
          These documents are used by the AI to generate plans and respond to athletes in your coaching voice.{' '}
          <strong className="text-[var(--text2)] font-medium">Athletes cannot see the document contents.</strong>
        </p>

        {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')} /></div>}
        {success && <div className="mb-4"><Alert type="success" message={success} onClose={() => setSuccess('')} /></div>}

        {/* Upload section */}
        <Card className="mb-8 fade-up-1">
          <div className="pb-3 mb-4 border-b border-[var(--border)]/70">
            <h3 className="font-display text-sm font-semibold text-[var(--text)] tracking-tight">Add Document</h3>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 mb-5 p-1 bg-[var(--surface2)] rounded-lg w-fit border border-[var(--border)]">
            <button onClick={() => setMode('paste')}
              className={`px-4 py-1.5 text-sm rounded-md font-medium transition-all ${
                mode === 'paste'
                  ? 'bg-[var(--surface3)] text-[var(--text)] border border-[var(--border2)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text2)]'
              }`}>Paste Text</button>
            <button onClick={() => setMode('file')}
              className={`px-4 py-1.5 text-sm rounded-md font-medium transition-all ${
                mode === 'file'
                  ? 'bg-[var(--surface3)] text-[var(--text)] border border-[var(--border2)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text2)]'
              }`}>Upload File</button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Base Building Sample Week"
              />
              <Select
                label="Document type"
                value={form.document_type}
                onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}
                options={DOC_TYPE_OPTIONS}
              />
            </div>

            {mode === 'paste' ? (
              <Textarea
                label="Content"
                value={form.content_text}
                onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))}
                rows={8}
                placeholder="Paste your coaching material here — sample week breakdowns, training block templates, injury modification rules, FAQs, taper notes..."
              />
            ) : (
              <div>
                <label className="text-xs font-medium text-[var(--text2)] uppercase tracking-wide block mb-2">
                  Upload file (.txt or .docx)
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-[var(--border)] hover:border-brand-500/50 hover:bg-brand-950/10 rounded-xl p-8 text-center cursor-pointer transition-all"
                >
                  <div className="w-12 h-12 rounded-full bg-[var(--surface2)] border border-[var(--border2)] flex items-center justify-center mx-auto mb-3 text-xl">📄</div>
                  <div className="text-sm font-medium text-[var(--text)]">Click to upload .txt or .docx</div>
                  <div className="text-xs text-[var(--muted)] mt-1">Text is extracted client-side before sending</div>
                </div>
                <input ref={fileRef} type="file" accept=".txt,.docx" onChange={handleFile} className="hidden" />
                {form.content_text && (
                  <div className="mt-2 text-xs text-brand-400">✓ File content extracted ({form.content_text.length} chars). Review above in Paste Text mode.</div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--muted)]">
                {form.content_text.length.toLocaleString()} / 20,000 characters
              </div>
              <Button onClick={save} loading={saving} variant="primary">Save Document</Button>
            </div>
          </div>
        </Card>

        {/* Doc list */}
        <div className="fade-up-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold text-[var(--text)] tracking-tight">
              Uploaded Documents{docs.length > 0 && ` (${docs.length})`}
            </h3>
          </div>
          {loading ? (
            <div className="text-sm text-[var(--muted)] text-center py-8">Loading...</div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-[var(--muted)] text-center py-8">
              No documents yet. Upload your coaching materials above.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map(doc => (
                editingId === doc.id ? (
                  <div key={doc.id} className="bg-[var(--surface)] border border-brand-800/40 rounded-xl p-4 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Title" value={editForm.title || ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
                      <Select label="Type" value={editForm.document_type || ''} onChange={e => setEditForm(f => ({ ...f, document_type: e.target.value }))} options={DOC_TYPE_OPTIONS} />
                    </div>
                    <Textarea label="Content" value={editForm.content_text || ''} onChange={e => setEditForm(f => ({ ...f, content_text: e.target.value }))} rows={6} />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button variant="primary" size="sm" loading={saving} onClick={saveEdit}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <DocumentCard key={doc.id} {...doc} onEdit={startEdit} onDelete={deleteDoc} />
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
