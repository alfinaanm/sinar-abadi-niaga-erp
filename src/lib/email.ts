/**
 * Layanan Notifikasi Email ERP Distribusi - CV Sinar Abadi Niaga
 * Mendukung pengiriman via Resend API dan mode simulasi (sandbox) otomatis.
 * Sesuai PRD_ERP.md Bab 11 (Fitur Nilai Tambah) & BR-12 (Tanpa HPP/Margin).
 */

export interface LowStockItem {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
  stok_minimum: number;
}

export interface EmailRecipient {
  email: string;
  nama: string;
  peran: string;
}

export interface SendEmailResult {
  success: boolean;
  mode: 'resend' | 'simulasi';
  messageId?: string;
  recipients: string[];
  itemCount: number;
  timestamp: string;
  htmlPreview: string;
  subject: string;
  message: string;
}

/**
 * Membuat template email HTML responsif dan elegan untuk peringatan stok menipis
 */
export function generateLowStockEmailHtml(items: LowStockItem[], dateStr: string): string {
  const habisCount = items.filter((it) => it.stok === 0).length;
  const menipisCount = items.filter((it) => it.stok > 0).length;

  const rowsHtml = items
    .map((item, idx) => {
      const isHabis = item.stok === 0;
      const statusBadge = isHabis
        ? `<span style="display:inline-block;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;">KRITIS (0)</span>`
        : `<span style="display:inline-block;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;background:#fef3c7;color:#b45309;border:1px solid #fde68a;">MENIPIS</span>`;

      const stokStyle = isHabis
        ? `font-weight:800;color:#dc2626;`
        : `font-weight:700;color:#d97706;`;

      const bgRow = idx % 2 === 0 ? '#ffffff' : '#f8fafc';

      return `
        <tr style="background-color:${bgRow};border-bottom:1px solid #e2e8f0;">
          <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#334155;font-weight:700;">${item.kode}</td>
          <td style="padding:10px 12px;font-size:13px;color:#0f172a;font-weight:600;">${item.nama}</td>
          <td style="padding:10px 12px;text-align:center;font-size:12px;color:#64748b;">${item.satuan}</td>
          <td style="padding:10px 12px;text-align:right;font-size:13px;${stokStyle}">${item.stok}</td>
          <td style="padding:10px 12px;text-align:right;font-size:12px;color:#64748b;">${item.stok_minimum}</td>
          <td style="padding:10px 12px;text-align:center;">${statusBadge}</td>
        </tr>
      `;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Peringatan Stok Menipis - CV Sinar Abadi Niaga</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:680px;margin:24px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.07),0 2px 4px -2px rgba(0,0,0,0.05);border:1px solid #e2e8f0;">
    
    <!-- HEADER -->
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px;color:#ffffff;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <div style="background:#2563eb;width:32px;height:32px;border-radius:8px;display:inline-block;text-align:center;line-height:32px;font-weight:900;font-size:16px;color:#ffffff;">
          SAN
        </div>
        <span style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;vertical-align:middle;margin-left:8px;">
          CV Sinar Abadi Niaga · ERP System
        </span>
      </div>
      <h1 style="margin:8px 0 4px 0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
        ⚠️ Peringatan Stok Menipis & Kritis
      </h1>
      <p style="margin:0;font-size:13px;color:#cbd5e1;">
        Laporan otomatis inventaris gudang per ${dateStr} (WIB)
      </p>
    </div>

    <!-- SUMMARY BANNER -->
    <div style="padding:20px 32px;background:#fffbeb;border-bottom:1px solid #fef3c7;">
      <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#92400e;">
        Ringkasan Kondisi Stok:
      </p>
      <div style="font-size:13px;color:#78350f;line-height:1.5;">
        Terdeteksi <strong>${items.length} barang</strong> yang membutuhkan pengadaan kembali:
        <span style="color:#b91c1c;font-weight:700;margin-left:4px;">${habisCount} barang habis (0)</span> dan 
        <span style="color:#b45309;font-weight:700;margin-left:4px;">${menipisCount} barang di bawah batas minimum</span>.
      </div>
    </div>

    <!-- TABEL BARANG -->
    <div style="padding:24px 32px;">
      <h3 style="margin:0 0 14px 0;font-size:14px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;">
        Daftar Barang Perlu Pengadaan
      </h3>
      
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;text-align:left;font-size:12px;">
          <thead>
            <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5e1;color:#475569;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">
              <th style="padding:10px 12px;">Kode</th>
              <th style="padding:10px 12px;">Nama Barang</th>
              <th style="padding:10px 12px;text-align:center;">Satuan</th>
              <th style="padding:10px 12px;text-align:right;">Stok Fisik</th>
              <th style="padding:10px 12px;text-align:right;">Batas Min</th>
              <th style="padding:10px 12px;text-align:center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- CALL TO ACTION -->
      <div style="margin-top:28px;padding:20px;background:#f8fafc;border-radius:12px;border:1px dashed #cbd5e1;text-align:center;">
        <p style="margin:0 0 12px 0;font-size:13px;color:#475569;font-weight:500;">
          Segera lakukan pengajuan pembelian (PO) ke pemasok resmi untuk mencegah kehabisan stok penjualan.
        </p>
        <a href="http://localhost:3000/pembelian" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 24px;border-radius:8px;box-shadow:0 2px 4px rgba(37,99,235,0.2);">
          Buka Modul Pembelian (PO) &rarr;
        </a>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;line-height:1.6;">
      <p style="margin:0;">
        Email ini dikirim otomatis oleh <strong>Sistem ERP Distribusi CV Sinar Abadi Niaga</strong> kepada Manajer dan Staf Gudang.
      </p>
      <p style="margin:4px 0 0 0;">
        Pemberitahuan internal rahasia. Sesuai aturan bisnis BR-12, harga pokok dan margin dirahasiakan dari operasional staf.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

/**
 * Mengirim email notifikasi stok menipis ke daftar penerima
 */
export async function sendLowStockAlertEmail(params: {
  recipients: EmailRecipient[];
  items: LowStockItem[];
  triggeredBy?: string;
}): Promise<SendEmailResult> {
  const { recipients, items, triggeredBy = 'Sistem Otomatis' } = params;

  const now = new Date();
  const dateFormatted = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(now);

  const subject = `[PERINGATAN STOK] ${items.length} Barang Menipis & Kritis - CV Sinar Abadi Niaga (${now.toLocaleDateString('id-ID')})`;
  const htmlContent = generateLowStockEmailHtml(items, dateFormatted);
  const recipientEmails = recipients.map((r) => r.email);

  const apiKey = process.env.RESEND_API_KEY;

  // 1. Jika API Key Resend terkonfigurasi, kirimkan via Resend API
  if (apiKey && apiKey.startsWith('re_')) {
    try {
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifikasi@sinarabadi.test';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `CV Sinar Abadi Niaga <${fromEmail}>`,
          to: recipientEmails,
          subject,
          html: htmlContent,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Gagal mengirim email via Resend');
      }

      const data = await res.json();
      return {
        success: true,
        mode: 'resend',
        messageId: data.id,
        recipients: recipientEmails,
        itemCount: items.length,
        timestamp: now.toISOString(),
        htmlPreview: htmlContent,
        subject,
        message: `Email berhasil dikirim via Resend ke ${recipientEmails.length} penerima.`,
      };
    } catch (err: unknown) {
      console.warn('Gagal kirim via Resend, beralih ke Mode Simulasi:', err);
    }
  }

  // 2. Mode Simulasi / Sandbox (Fallback handal untuk pengujian lokal & capstone)
  console.log(`[SIMULASI EMAIL NOTIFIKASI STOK]`);
  console.log(`Pemicu   : ${triggeredBy}`);
  console.log(`Penerima : ${recipientEmails.join(', ')}`);
  console.log(`Subjek   : ${subject}`);
  console.log(`Jumlah   : ${items.length} barang menipis`);

  return {
    success: true,
    mode: 'simulasi',
    messageId: `sim-${Date.now()}`,
    recipients: recipientEmails,
    itemCount: items.length,
    timestamp: now.toISOString(),
    htmlPreview: htmlContent,
    subject,
    message: `Notifikasi email stok berhasil diproses (Mode Simulasi / Sandbox). Siap dikirim ke ${recipientEmails.join(', ')}.`,
  };
}
