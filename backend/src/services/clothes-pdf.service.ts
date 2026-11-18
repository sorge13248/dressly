import { Injectable, Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { AuthUser } from '../common/auth/auth.types';

@Injectable()
export class ClothesPdfService {
  private readonly logger = new Logger(ClothesPdfService.name);

  async generateClothPdf(
    user: AuthUser,
    item: any,
    resolveAttachmentAbsolutePath: (relativePath: string) => string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    // Primary photo preparation
    const primaryAttachment = item.attachments?.find((a: any) => a.kind === 'photo') ?? item.attachments?.[0];
    let primaryPhotoBuffer: Buffer | null = null;
    if (primaryAttachment) {
      try {
        const photoAbsPath = resolveAttachmentAbsolutePath(primaryAttachment.path);
        primaryPhotoBuffer = await sharp(photoAbsPath)
          .rotate()
          .resize(400, 500, { fit: 'inside' })
          .jpeg({ quality: 88 })
          .toBuffer();
      } catch (err) {
        this.logger.warn(`Could not load primary photo for PDF generation: ${String(err)}`);
      }
    }

    // Secondary photos (up to 4 thumbnails)
    const secondaryAttachments = (item.attachments ?? []).filter((a: any) => a.id !== primaryAttachment?.id).slice(0, 4);
    const secondaryPhotoBuffers: Buffer[] = [];
    for (const secAtt of secondaryAttachments) {
      try {
        let secPath = secAtt.previewPath ? resolveAttachmentAbsolutePath(secAtt.previewPath) : null;
        if (!secPath || !existsSync(secPath)) {
          secPath = resolveAttachmentAbsolutePath(secAtt.path);
        }
        const buf = await sharp(secPath)
          .rotate()
          .resize(120, 120, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();
        secondaryPhotoBuffers.push(buf);
      } catch {
        // Ignore unreadable secondary previews
      }
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      info: {
        Title: item.name || item.code || 'Scheda Capo Dressly',
        Author: 'Dressly Digital Wardrobe',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const sanitize = (val: string | null | undefined) => {
      if (!val) return '';
      return val
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}]/gu, '')
        .trim();
    };

    // --- Header Section ---
    // Top blue accent bar
    doc.rect(36, 36, 523, 4).fill('#0284c7');

    // Title / Brand
    doc.fillColor('#0284c7').font('Helvetica-Bold').fontSize(16).text('DRESSLY', 36, 46);
    doc.fillColor('#64748b').font('Helvetica').fontSize(8.5).text('SCHEDA TECNICA CAPO', 36, 64);

    // Tag Code pill on the right
    if (item.code) {
      doc.roundedRect(460, 44, 99, 26, 5).fillAndStroke('#e0f2fe', '#0284c7');
      doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(13).text(item.code, 460, 50, { width: 99, align: 'center' });
    }

    const genDateStr = `Generato il ${new Date().toLocaleDateString('it-IT')}`;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text(genDateStr, 300, 65, { width: 150, align: 'right' });

    // Divider line
    doc.moveTo(36, 78).lineTo(559, 78).strokeColor('#e2e8f0').lineWidth(0.8).stroke();

    // --- Hero Section (Photo + Metadata) ---
    const heroY = 88;
    const photoWidth = 185;
    const photoHeight = 225;

    // Photo Box Frame
    doc.roundedRect(36, heroY, photoWidth, photoHeight, 6).fillAndStroke('#f8fafc', '#cbd5e1');

    if (primaryPhotoBuffer) {
      doc.image(primaryPhotoBuffer, 38, heroY + 2, {
        fit: [photoWidth - 4, photoHeight - 4],
        align: 'center',
        valign: 'center',
      });
    } else {
      doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(11).text('Nessuna Foto', 36, heroY + 100, {
        width: photoWidth,
        align: 'center',
      });
    }

    // Metadata column on the right
    const metaX = 232;
    const metaWidth = 327;
    let currentY = heroY + 2;

    // Item Title
    const titleText = sanitize(item.fullTitle || item.name || 'Capo senza nome');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(15).text(titleText, metaX, currentY, {
      width: metaWidth,
      lineBreak: true,
    });
    currentY = doc.y + 6;

    // Status Badge
    let statusLabel = "Nell'armadio";
    let statusBg = '#d1fae5';
    let statusColor = '#065f46';
    let statusBorder = '#10b981';

    if (item.status === 'in_storage') {
      const roomLocParts = [item.location?.room?.name, item.location?.name].filter(Boolean).join(' > ');
      statusLabel = `In Deposito${roomLocParts ? ': ' + sanitize(roomLocParts) : ''}`;
      statusBg = '#fef3c7';
      statusColor = '#92400e';
      statusBorder = '#f59e0b';
    } else if (item.status === 'dismissed') {
      statusLabel = 'Dismesso';
      statusBg = '#f1f5f9';
      statusColor = '#475569';
      statusBorder = '#94a3b8';
    }

    doc.font('Helvetica-Bold').fontSize(8.5);
    const badgeWidth = Math.min(220, doc.widthOfString(statusLabel) + 16);
    doc.roundedRect(metaX, currentY, badgeWidth, 18, 4).fillAndStroke(statusBg, statusBorder);
    doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(8.5).text(statusLabel, metaX, currentY + 4, {
      width: badgeWidth,
      align: 'center',
    });

    if (item.isInWashing) {
      const washX = metaX + badgeWidth + 6;
      doc.roundedRect(washX, currentY, 65, 18, 4).fillAndStroke('#e0f2fe', '#0284c7');
      doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(8).text('In Lavatrice', washX, currentY + 4, { width: 65, align: 'center' });
    } else if (item.isInIroning) {
      const ironX = metaX + badgeWidth + 6;
      doc.roundedRect(ironX, currentY, 65, 18, 4).fillAndStroke('#fef3c7', '#d97706');
      doc.fillColor('#b45309').font('Helvetica-Bold').fontSize(8).text('Da Stirare', ironX, currentY + 4, { width: 65, align: 'center' });
    }

    currentY += 26;

    // Key properties grid
    const properties: Array<{ label: string; value: string; isColors?: boolean }> = [];
    if (item.isCumulative || (item.quantity && item.quantity > 1)) {
      properties.push({ label: 'Quantita', value: String(item.quantity || 1) });
    }
    if (item.size) properties.push({ label: 'Taglia', value: sanitize(item.size) });
    if (item.brand?.name) properties.push({ label: 'Brand', value: sanitize(item.brand.name) });
    if (item.type?.name) properties.push({ label: 'Categoria', value: sanitize(item.type.name) });
    if (item.fit?.name) properties.push({ label: 'Fit', value: sanitize(item.fit.name) });

    if (item.seasons && item.seasons.length > 0) {
      properties.push({ label: 'Stagioni', value: item.seasons.map((s: any) => sanitize(s.name)).join(', ') });
    }
    if (item.temperatures && item.temperatures.length > 0) {
      properties.push({ label: 'Temperature', value: item.temperatures.map((t: any) => sanitize(t.name)).join(', ') });
    }
    if (item.useCases && item.useCases.length > 0) {
      properties.push({ label: 'Occasioni', value: item.useCases.map((u: any) => sanitize(u.name)).join(', ') });
    }
    if (item.colors && item.colors.length > 0) {
      properties.push({ label: 'Colori', value: item.colors.map((c: any) => sanitize(c.name)).join(', '), isColors: true });
    }
    if (item.materials && item.materials.length > 0) {
      properties.push({ label: 'Materiali', value: item.materials.map((m: any) => sanitize(m.name)).join(', ') });
    }
    if (item.tags && item.tags.length > 0) {
      properties.push({ label: 'Tag', value: item.tags.map((t: any) => '#' + sanitize(t.name)).join(' ') });
    }

    for (const prop of properties) {
      if (currentY > heroY + photoHeight + 10) break;
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8.5).text(prop.label, metaX, currentY, { width: 75 });

      if (prop.isColors && item.colors && item.colors.length > 0) {
        let colX = metaX + 80;
        for (const col of item.colors) {
          if (col.hexCode && /^#[0-9A-Fa-f]{6}$/.test(col.hexCode)) {
            doc.circle(colX + 4, currentY + 5, 4).fillAndStroke(col.hexCode, '#cbd5e1');
            colX += 12;
          }
          const colName = sanitize(col.name);
          doc.fillColor('#1e293b').font('Helvetica').fontSize(8.5).text(colName + '  ', colX, currentY);
          colX += doc.widthOfString(colName + '  ');
        }
      } else {
        doc.fillColor('#1e293b').font('Helvetica').fontSize(8.5).text(prop.value, metaX + 80, currentY, {
          width: metaWidth - 85,
          lineBreak: false,
          ellipsis: true,
        });
      }
      currentY += 15;
    }

    // --- Notes Section ---
    let sectionY = Math.max(heroY + photoHeight + 14, currentY + 10);
    if (item.notes) {
      const noteText = sanitize(item.notes);
      doc.font('Helvetica').fontSize(8.5);
      const noteHeight = Math.min(48, Math.max(28, doc.heightOfString(noteText, { width: 505 }) + 14));
      doc.roundedRect(36, sectionY, 523, noteHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
      doc.fillColor('#0284c7').font('Helvetica-Bold').fontSize(7.5).text('NOTE', 44, sectionY + 4);
      doc.fillColor('#334155').font('Helvetica-Oblique').fontSize(8.5).text(noteText, 44, sectionY + 14, {
        width: 505,
        height: noteHeight - 16,
        ellipsis: true,
      });
      sectionY += noteHeight + 12;
    }

    // --- Care Instructions Grid (4 panels) ---
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('CURA E MANUTENZIONE', 36, sectionY);
    sectionY += 16;

    const careCardWidth = 125;
    const careCardHeight = 110;
    const cardGap = 8;

    // Card 1: Lavaggio
    const washX = 36;
    doc.roundedRect(washX, sectionY, careCardWidth, careCardHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.rect(washX, sectionY, careCardWidth, 18).fill('#e0f2fe');
    doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(8.5).text('LAVAGGIO', washX, sectionY + 5, { width: careCardWidth, align: 'center' });

    let washDetails = 'Nessuna indicazione';
    if (item.washingInstruction) {
      const wi = item.washingInstruction;
      const lines: string[] = [];
      if (wi.washType === 'do_not_wash') lines.push('Non lavare');
      else if (wi.washType === 'hand_wash_only') lines.push('Solo lavaggio a mano');
      else if (wi.washType === 'washer_ok') lines.push('Lavabile in lavatrice');

      if (wi.temperature) {
        lines.push(wi.temperature === '0' ? 'A freddo' : `${wi.temperature}°C max`);
      }
      if (wi.bleachType === 'no_bleach') lines.push('Non candeggiare');
      else if (wi.bleachType === 'non_chlorine_bleach') lines.push('Solo senza cloro');
      else if (wi.bleachType === 'any_bleach') lines.push('Candeggio consentito');

      if (wi.washSeparately) lines.push('Separatamente');
      if (wi.reverseWashing) lines.push('Al rovescio');
      washDetails = lines.join('\n');
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(washDetails, washX + 8, sectionY + 24, {
      width: careCardWidth - 16,
      lineBreak: true,
    });

    // Card 2: Asciugatura
    const dryX = washX + careCardWidth + cardGap;
    doc.roundedRect(dryX, sectionY, careCardWidth, careCardHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.rect(dryX, sectionY, careCardWidth, 18).fill('#e0f2fe');
    doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(8.5).text('ASCIUGATURA', dryX, sectionY + 5, { width: careCardWidth, align: 'center' });

    let dryDetails = 'Nessuna indicazione';
    if (item.dryingInstruction) {
      const di = item.dryingInstruction;
      const lines: string[] = [];
      if (di.tumbleDry === false) {
        lines.push('Asciugatrice vietata');
      } else if (di.tumbleDry === true) {
        if (di.tumbleDryTemperature === 'low') lines.push('Asciugatrice bassa temp (*)');
        else if (di.tumbleDryTemperature === 'medium') lines.push('Asciugatrice media temp (**)');
        else if (di.tumbleDryTemperature === 'high') lines.push('Asciugatrice alta temp (***)');
        else lines.push('Asciugatrice consentita');
      }

      if (di.method) {
        const methodMap: Record<string, string> = {
          line_dry: "Stendere all'aperto",
          flat_dry: 'Asciugare disteso in piano',
          drip_dry: 'Asciugare gocciolante',
          line_shade: "All'ombra appeso",
          flat_shade: "All'ombra disteso",
        };
        lines.push(methodMap[di.method] || sanitize(di.method));
      }
      dryDetails = lines.join('\n');
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(dryDetails, dryX + 8, sectionY + 24, {
      width: careCardWidth - 16,
      lineBreak: true,
    });

    // Card 3: Stiratura
    const ironX = dryX + careCardWidth + cardGap;
    doc.roundedRect(ironX, sectionY, careCardWidth, careCardHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.rect(ironX, sectionY, careCardWidth, 18).fill('#e0f2fe');
    doc.fillColor('#0369a1').font('Helvetica-Bold').fontSize(8.5).text('STIRATURA', ironX, sectionY + 5, { width: careCardWidth, align: 'center' });

    let ironDetails = 'Nessuna indicazione';
    if (item.ironingInstruction) {
      const ii = item.ironingInstruction;
      const lines: string[] = [];
      if (ii.ironType === 'no') lines.push('Non stirare');
      else if (ii.ironType === 'without_steam') lines.push('Stirare senza vapore');
      else if (ii.ironType === 'yes') lines.push('Stirabile con vapore');

      const temp = Number(ii.temperature);
      if (temp === 1) lines.push('Bassa temp 110°C (*)');
      else if (temp === 2) lines.push('Media temp 150°C (**)');
      else if (temp === 3) lines.push('Alta temp 200°C (***)');

      if (ii.ironInsideOut) lines.push('Stirare al rovescio');
      ironDetails = lines.join('\n');
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(ironDetails, ironX + 8, sectionY + 24, {
      width: careCardWidth - 16,
      lineBreak: true,
    });

    // Card 4: Dettagli Acquisto
    const buyX = ironX + careCardWidth + cardGap;
    doc.roundedRect(buyX, sectionY, careCardWidth, careCardHeight, 5).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.rect(buyX, sectionY, careCardWidth, 18).fill('#f1f5f9');
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.5).text('ACQUISTO', buyX, sectionY + 5, { width: careCardWidth, align: 'center' });

    let buyDetails = 'Non specificato';
    if (item.buyDetail) {
      const bd = item.buyDetail;
      const lines: string[] = [];
      if (bd.store) lines.push(`Negozio: ${sanitize(bd.store)}`);
      if (bd.purchaseDate) lines.push(`Data: ${sanitize(bd.purchaseDate)}`);
      if (bd.priceCents != null) {
        lines.push(`Prezzo: ${(bd.priceCents / 100).toFixed(2)} EUR`);
      }
      if (bd.shopUrl) lines.push('Link store disponibile');
      buyDetails = lines.join('\n') || 'Non specificato';
    }
    doc.fillColor('#334155').font('Helvetica').fontSize(7.5).text(buyDetails, buyX + 8, sectionY + 24, {
      width: careCardWidth - 16,
      lineBreak: true,
    });

    sectionY += careCardHeight + 14;

    // --- Secondary Photos Strip (if any) ---
    if (secondaryPhotoBuffers.length > 0 && sectionY < 720) {
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text('GALLERIA FOTOGRAFICA', 36, sectionY);
      sectionY += 14;

      const thumbSize = 65;
      let thumbX = 36;
      for (const thumbBuf of secondaryPhotoBuffers) {
        doc.roundedRect(thumbX, sectionY, thumbSize, thumbSize, 4).fillAndStroke('#f8fafc', '#cbd5e1');
        doc.image(thumbBuf, thumbX + 1, sectionY + 1, {
          fit: [thumbSize - 2, thumbSize - 2],
          align: 'center',
          valign: 'center',
        });
        thumbX += thumbSize + 10;
      }
    }

    // --- Footer ---
    doc.moveTo(36, 792).lineTo(559, 792).strokeColor('#e2e8f0').lineWidth(0.8).stroke();
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text('Dressly — Guardaroba Digitale Personale', 36, 800);
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text('Pagina 1 / 1', 460, 800, { width: 99, align: 'right' });

    doc.end();

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const slug = (item.name || item.code || 'capo')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 30);
    const filename = `capo-${item.code ? item.code + '-' : ''}${slug}.pdf`;

    return { buffer, filename };
  }
}
