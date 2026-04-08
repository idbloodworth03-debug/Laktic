import { useRef, useEffect, useCallback, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type ShareCardData = {
  athleteName: string;
  raceName: string;
  distance: string;
  finishTime: string;
  date: string;
  isPr: boolean;
  eventType?: 'race' | 'milestone' | 'challenge' | 'prediction';
  subtitle?: string; // e.g. milestone name, challenge name
};

const W = 1080;
const H = 1080;

function loadIcon(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = '/icon.png';
  });
}

function drawCard(ctx: CanvasRenderingContext2D, data: ShareCardData, iconImg?: HTMLImageElement) {
  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(0,229,160,0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Top-left accent bar
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#00E5A0');
  grad.addColorStop(1, '#00cc88');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 8);

  // Card frame
  ctx.strokeStyle = 'rgba(0,229,160,0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // LAKTIC wordmark — top left
  ctx.font = 'bold 28px "Arial Black", Arial, sans-serif';
  ctx.fillStyle = '#00E5A0';
  ctx.letterSpacing = '4px';
  ctx.fillText('LAKTIC', 72, 100);
  ctx.letterSpacing = '0px';

  // Card type tag — top right
  const cardLabel = data.eventType === 'milestone' ? 'MILESTONE'
    : data.eventType === 'challenge' ? 'CHALLENGE'
    : data.eventType === 'prediction' ? 'PREDICTION PR'
    : 'RACE RESULT';

  ctx.font = '700 18px Arial, sans-serif';
  ctx.fillStyle = '#00E5A0';
  const tagW = ctx.measureText(cardLabel).width + 32;
  ctx.fillStyle = 'rgba(0,229,160,0.12)';
  ctx.beginPath();
  ctx.roundRect(W - 72 - tagW, 72, tagW, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#00E5A0';
  ctx.font = '700 15px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(cardLabel, W - 72, 98);
  ctx.textAlign = 'left';

  // PR badge — center upper
  if (data.isPr) {
    const badgeX = W / 2;
    const badgeY = 210;
    ctx.fillStyle = '#ca8a04';
    ctx.beginPath();
    ctx.roundRect(badgeX - 80, badgeY - 30, 160, 56, 12);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 26px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEW PR', badgeX, badgeY + 8);
    ctx.textAlign = 'left';
  }

  // Main time / headline — massive
  const mainText = data.finishTime || data.subtitle || '';
  ctx.font = `bold ${mainText.length > 7 ? '120' : '140'}px "Arial Black", Arial, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(mainText, W / 2, data.isPr ? 430 : 400);
  ctx.textAlign = 'left';

  // Race name
  ctx.font = 'bold 48px Arial, sans-serif';
  ctx.fillStyle = '#f0fdf4';
  ctx.textAlign = 'center';
  const raceLabel = data.raceName.length > 28 ? data.raceName.slice(0, 26) + '...' : data.raceName;
  ctx.fillText(raceLabel, W / 2, 530);
  ctx.textAlign = 'left';

  // Distance + Date row
  const metaY = 610;
  ctx.font = '500 30px Arial, sans-serif';
  ctx.fillStyle = '#00E5A0';
  ctx.textAlign = 'center';
  ctx.fillText(`${data.distance}  ·  ${data.date}`, W / 2, metaY);
  ctx.textAlign = 'left';

  // Divider line
  ctx.strokeStyle = 'rgba(0,229,160,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(120, 680); ctx.lineTo(W - 120, 680); ctx.stroke();

  // Athlete name
  ctx.font = '500 36px Arial, sans-serif';
  ctx.fillStyle = '#d1fae5';
  ctx.textAlign = 'center';
  ctx.fillText(data.athleteName, W / 2, 748);
  ctx.textAlign = 'left';

  // Bottom "Trained with Laktic AI" watermark
  ctx.font = '400 22px Arial, sans-serif';
  ctx.fillStyle = 'rgba(134,239,172,0.5)';
  ctx.textAlign = 'center';
  ctx.fillText('Trained with Laktic AI', W / 2, 940);
  ctx.textAlign = 'left';

  // Icon watermark — bottom right
  if (iconImg) {
    const iconSize = 52;
    const iconX = W - 72 - iconSize;
    const iconY = H - 72 - iconSize;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.roundRect(iconX, iconY, iconSize, iconSize, 10);
    ctx.clip();
    ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);
    ctx.restore();
  }

  // Corner accent dots
  ctx.fillStyle = 'rgba(0,229,160,0.4)';
  [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]].forEach(([x, y]) => {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  });
}

// ── Upload to Supabase Storage ────────────────────────────────────────────────

export async function uploadShareCard(canvas: HTMLCanvasElement, fileName: string): Promise<string | null> {
  return new Promise(resolve => {
    canvas.toBlob(async (blob) => {
      if (!blob) { resolve(null); return; }
      const path = `race-cards/${Date.now()}-${fileName}.png`;
      const { error } = await supabase.storage
        .from('race-cards')
        .upload(path, blob, { contentType: 'image/png', upsert: true });
      if (error) { console.error('[shareCard] upload error:', error); resolve(null); return; }
      const { data } = supabase.storage.from('race-cards').getPublicUrl(path);
      resolve(data.publicUrl);
    }, 'image/png');
  });
}

// ── Download locally ──────────────────────────────────────────────────────────

export function downloadShareCard(canvas: HTMLCanvasElement, fileName: string) {
  const link = document.createElement('a');
  link.download = `${fileName}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ── Web Share / Clipboard ─────────────────────────────────────────────────────

export async function shareCard(canvas: HTMLCanvasElement, title: string, url?: string): Promise<'shared' | 'copied' | 'error'> {
  // Mobile: try Web Share API with image
  if (navigator.share && navigator.canShare) {
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const file = new File([blob], 'laktic-result.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title, files: [file], url });
          return 'shared';
        }
      }
    } catch {
      // Fall through to clipboard
    }
  }

  // Desktop: copy link to clipboard
  if (url && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'error';
    }
  }

  return 'error';
}

// ── React component ───────────────────────────────────────────────────────────

interface Props {
  data: ShareCardData;
  size?: number; // preview size in px
}

export function ShareCardCanvas({ data, size = 360 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [iconImg, setIconImg] = useState<HTMLImageElement | undefined>(undefined);

  useEffect(() => {
    loadIcon().then(setIconImg).catch(() => {});
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawCard(ctx, data, iconImg);
  }, [data, iconImg]);

  useEffect(() => { render(); }, [render]);

  // Expose canvas via ref data attribute so parent can call download/share
  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ width: size, height: size, borderRadius: 12, display: 'block' }}
      data-card="true"
    />
  );
}

// Return a raw canvas (not rendered to DOM) for upload/download
export async function renderCardToCanvas(data: ShareCardData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const iconImg = await loadIcon().catch(() => undefined);
  drawCard(ctx, data, iconImg);
  return canvas;
}
