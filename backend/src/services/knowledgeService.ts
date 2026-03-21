import { supabase } from '../db/supabase';

const PRIORITY_ORDER = ['philosophy', 'sample_week', 'training_block', 'taper', 'injury_rule', 'faq', 'notes'];
const MAX_CHARS = 8000;
const NEVER_TRUNCATE = ['philosophy', 'sample_week'];

export async function getFormattedKnowledge(botId: string): Promise<string> {
  const { data: docs, error } = await supabase
    .from('coach_knowledge_documents')
    .select('*')
    .eq('coach_bot_id', botId)
    .order('created_at', { ascending: true });

  if (error || !docs || docs.length === 0) return '';

  // Sort by priority
  const sorted = [...docs].sort((a, b) => {
    return PRIORITY_ORDER.indexOf(a.document_type) - PRIORITY_ORDER.indexOf(b.document_type);
  });

  const sections: string[] = [];
  let totalChars = 0;

  for (const doc of sorted) {
    const header = `[${doc.document_type.toUpperCase()}] ${doc.title}\n`;
    const content = doc.content_text;
    const full = header + content + '\n---\n';

    if (NEVER_TRUNCATE.includes(doc.document_type)) {
      sections.push(full);
      totalChars += full.length;
    } else {
      const remaining = MAX_CHARS - totalChars;
      if (remaining <= 0) break;
      if (full.length <= remaining) {
        sections.push(full);
        totalChars += full.length;
      } else {
        // Truncate this doc
        const truncated = header + content.slice(0, remaining - header.length - 10) + '...\n---\n';
        sections.push(truncated);
        totalChars += truncated.length;
        break;
      }
    }
  }

  return sections.join('\n');
}
