import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabaseClient';
import { Navbar, Button, Input, Textarea, Select, Card, DocumentCard, Alert, Spinner } from '../components/ui';

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
type DocVersion = { id: string; version_number: number; title: string; created_at: string; content_text?: string };

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

  // Version history drawer
  const [historyDocId, setHistoryDocId] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DocVersion | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);

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
      setMode('paste'); // switch to show the extracted text
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

  const openHistory = async (id: string) => {
    setHistoryDocId(id);
    setSelectedVersion(null);
    setVersionsLoading(true);
    try {
      const data = await apiFetch(`/api/coach/bot/knowledge/${id}/versions`);
      setVersions(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setVersionsLoading(false);
    }
  };

  const loadVersionContent = async (docId: string, vNum: number) => {
    setVersionLoading(true);
    try {
      const data = await apiFetch(`/api/coach/bot/knowledge/${docId}/versions/${vNum}`);
      setSelectedVersion(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setVersionLoading(false);
    }
  };

  const restoreVersion = async () => {
    if (!historyDocId || !selectedVersion) return;
    setSaving(true);
    try {
      const updated = await apiFetch(`/api/coach/bot/knowledge/${historyDocId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: selectedVersion.title, content_text: selectedVersion.content_text }),
      });
      setDocs(prev => prev.map(d => d.id === historyDocId ? updated : d));
      setHistoryDocId(null);
      setSuccess('Document restored to selected version.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const historyDoc = docs.find(d => d.id === historyDocId);

  return (
    <div className="min-h-screen">
      <Navbar role="coach" name={profile?.name} onLogout={logout} />

      {/* Version history drawer */}
      {historyDocId && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => { setHistoryDocId(null); setSelectedVersion(null); }} />
          <div className="w-full max-w-xl bg-[var(--bg)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <div>
                <h2 className="font-display text-base font-semibold">Version History</h2>
                <p className="text-xs text-[var(--muted)] mt-0.5">{historyDoc?.title}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setHistoryDocId(null); setSelectedVersion(null); }}>Close</Button>
            </div>
            <div className="flex flex-1 overflow-hidden">
              {/* Version list */}
              <div className="w-48 border-r border-[var(--border)] flex flex-col overflow-y-auto shrink-0">
                {versionsLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : versions.length === 0 ? (
                  <div className="px-4 py-6 text-xs text-[var(--muted)] text-center">No saved versions yet. Versions are created when you edit a document.</div>
                ) : (
                  versions.map(v => (
                    <button
                      key={v.id}
                      onClick={() => loadVersionContent(historyDocId, v.version_number)}
                      className={`text-left px-4 py-3 border-b border-[var(--border)]/50 hover:bg-[var(--surface2)] transition-colors ${selectedVersion?.version_number === v.version_number ? 'bg-[var(--surface2)] border-l-2 border-l-brand-500' : ''}`}
                    >
                      <div className="text-xs font-medium text-[var(--text)]">v{v.version_number}</div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">{new Date(v.created_at).toLocaleDateString()}</div>
                      <div className="text-xs text-[var(--muted)]">{new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </button>
                  ))
                )}
              </div>
              {/* Version content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {versionLoading ? (
                  <div className="flex justify-center py-8"><Spinner /></div>
                ) : selectedVersion ? (
                  <>
                    <div className="flex-1 overflow-y-auto p-4">
                      <p className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">{selectedVersion.title} — v{selectedVersion.version_number}</p>
                      <pre className="text-xs text-[var(--text2)] whitespace-pre-wrap leading-relaxed font-sans">{selectedVersion.content_text}</pre>
                    </div>
                    <div className="px-4 py-3 border-t border-[var(--border)]">
                      <Button size="sm" loading={saving} onClick={restoreVersion} className="w-full">
                        Restore this version
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-[var(--muted)] px-4 text-center">
                    Select a version from the list to preview its content
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Training Knowledge</h1>
          <Link to="/coach/dashboard"><Button variant="ghost" size="sm">← Dashboard</Button></Link>
        </div>
        <p className="text-sm text-[var(--muted)] mb-8">
          These documents are used by the AI to generate plans and respond to athletes in your coaching voice.
          <strong className="text-[var(--text)]"> Athletes cannot see the document contents.</strong>
        </p>

        {error && <Alert type="error" message={error} onClose={() => setError('')} />}
        {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

        {/* Upload section */}
        <Card className="mb-8">
          <h3 className="font-display font-semibold mb-4">Add Document</h3>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setMode('paste')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'paste' ? 'bg-brand-600 text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}>Paste Text</button>
            <button onClick={() => setMode('file')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'file' ? 'bg-brand-600 text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}>Upload File</button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Base Building Sample Week" />
              <Select label="Document type" value={form.document_type} onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))} options={DOC_TYPE_OPTIONS} />
            </div>

            {mode === 'paste' ? (
              <Textarea label="Content" value={form.content_text} onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))} rows={8} placeholder="Paste your coaching material here — sample week breakdowns, training block templates, injury modification rules, FAQs, taper notes..." />
            ) : (
              <div>
                <label className="text-sm font-medium text-[var(--muted)] block mb-2">Upload file (.txt or .docx)</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-[var(--border)] hover:border-brand-500 rounded-xl p-8 text-center cursor-pointer transition-colors"
                >
                  <div className="text-3xl mb-2">📄</div>
                  <div className="text-sm font-medium">Click to upload .txt or .docx</div>
                  <div className="text-xs text-[var(--muted)] mt-1">Text is extracted client-side before sending</div>
                </div>
                <input ref={fileRef} type="file" accept=".txt,.docx" onChange={handleFile} className="hidden" />
                {form.content_text && (
                  <div className="mt-2 text-xs text-brand-400">✓ File content extracted ({form.content_text.length} chars). Review above in Paste Text mode.</div>
                )}
              </div>
            )}

            <div className="text-xs text-[var(--muted)]">Max 20,000 characters per document. {form.content_text.length}/20000</div>

            <div className="flex justify-end">
              <Button onClick={save} loading={saving} variant="primary">Save Document</Button>
            </div>
          </div>
        </Card>

        {/* Doc list */}
        <div>
          <h3 className="font-display font-semibold mb-4">Uploaded Documents ({docs.length})</h3>
          {loading ? (
            <div className="text-sm text-[var(--muted)] text-center py-8">Loading...</div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-[var(--muted)] text-center py-8">No documents yet. Upload your coaching materials above.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {docs.map(doc => (
                editingId === doc.id ? (
                  <div key={doc.id} className="bg-[var(--surface2)] border border-brand-700/40 rounded-xl p-4 flex flex-col gap-3">
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
                  <DocumentCard key={doc.id} {...doc} onEdit={startEdit} onDelete={deleteDoc} onHistory={openHistory} />
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
