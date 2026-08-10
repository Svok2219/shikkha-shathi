import 'regenerator-runtime/runtime'
import { getBlob } from '@/lib/blob'
import { getApplication } from '@/lib/db'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import { Resvg } from '@resvg/resvg-js'
import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/download-token'

export const runtime = 'nodejs'

function text(value: unknown) { return String(value ?? '').replace(/[\r\n]+/g, ' ').trim() }
function esc(value: unknown) { return text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function wrap(value: string, width = 58) { const words = value.split(/\s+/); const lines: string[] = []; let line = ''; for (const word of words) { const next = `${line} ${word}`.trim(); if (line && next.length > width) { lines.push(line); line = word } else line = next } if (line) lines.push(line); return lines }
async function getImage(pathname: string | null) { if (!pathname) return null; const result = await getBlob(pathname, { access: 'private' }); return result?.buffer || null }

async function renderBengaliSvg(body: string, fontPath: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754"><style>text{font-family:'Noto Sans Bengali',sans-serif}</style>${body}</svg>`
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: 1240 }, font: { fontFiles: [fontPath], loadSystemFonts: false } }).render().asPng())
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isAdminRequest(request, request.nextUrl.searchParams.get('token'), id, 'pdf')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const row = await getApplication(id); if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const fontPath = path.join(process.cwd(), 'public/fonts/NotoSansBengali.ttf')
    if (!await fs.stat(fontPath).then(() => true).catch(() => false)) throw new Error('Bengali font asset is missing')
    const pdf = await PDFDocument.create(); const green = '#1a5940'; const ink = '#17382b'; const muted = '#61766d'; const pale = '#f3f8f5'
    const marksheet = await getImage(row.marksheetPath); const proof = await getImage(row.proofPath)
    const writerText = row.books.map((book) => row.bookWriters?.[book] ? `${book} — ${row.bookWriters[book]}` : book).join(' · ')
    const details: [string, string][] = [['মোবাইল', text(row.phone)], ['ইমেইল', text(row.email)], ['কলেজ', text(row.college)], ['চা-বাগান', text(row.garden)], ['অভিভাবকের পেশা', text(row.guardianJob)], ['GPA', text(row.gpa)], ['বিভাগ', text(row.department)]]
    let y = 485; let detailSvg = ''
    for (const [label, value] of details) { const lines = wrap(value || 'দেওয়া হয়নি', 38).slice(0, 2); detailSvg += `<text x="110" y="${y}" font-size="25" fill="${muted}">${esc(label)}:</text>`; lines.forEach((line, i) => { detailSvg += `<text x="390" y="${y + i * 32}" font-size="25" fill="${ink}">${esc(line)}</text>` }); y += 70 }
    const bookStart = y + 28
    const bookLines = wrap(writerText || 'কোনো বই নির্বাচন করা হয়নি', 54).slice(0, 5).map((line, i) => `<text x="110" y="${bookStart + 45 + i * 34}" font-size="23" fill="${ink}">${esc(line)}</text>`).join('')
    const documentsY = bookStart + 45 + Math.max(1, Math.min(5, wrap(writerText || 'কোনো বই নির্বাচন করা হয়নি', 54).length)) * 34 + 45
    const body = `<rect width="1240" height="1754" fill="#ffffff"/><rect width="1240" height="235" fill="${green}"/><text x="110" y="110" font-size="38" fill="#ffffff">শিক্ষা-উপকরণ সহায়তা কর্মসূচি ২০২৬</text><text x="110" y="170" font-size="27" fill="#f7f1e3">শিক্ষার্থী আবেদনপত্র · পূর্ণাঙ্গ প্রতিবেদন</text><text x="110" y="310" font-size="42" fill="${ink}">${esc(row.name)}</text><text x="110" y="355" font-size="22" fill="${muted}">রেফারেন্স: ${esc(id)}</text><rect x="75" y="390" width="1090" height="${documentsY + 90 - 390}" rx="18" fill="${pale}" stroke="#c7dbd0" stroke-width="3"/><text x="110" y="445" font-size="31" fill="${ink}">আবেদনকারীর তথ্য</text>${detailSvg}<text x="110" y="${bookStart}" font-size="30" fill="${ink}">বই ও লেখক/প্রকাশনী</text>${bookLines}<text x="110" y="${documentsY}" font-size="27" fill="${ink}">সংযুক্ত নথি</text><text x="110" y="${documentsY + 45}" font-size="23" fill="${muted}">${marksheet ? 'মার্কশীট সংযুক্ত আছে' : 'মার্কশীট পাওয়া যায়নি'} · ${proof ? 'প্রমাণপত্র সংযুক্ত আছে' : 'প্রমাণপত্র পাওয়া যায়নি'}</text>`
    const firstPage = pdf.addPage([595, 842]); const png = await renderBengaliSvg(body, fontPath); const image = await pdf.embedPng(png); firstPage.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
    const addImagePage = async (title: string, buffer: Buffer | null) => { if (!buffer) return; const page = pdf.addPage([595, 842]); const embedded = buffer[0] === 0xff && buffer[1] === 0xd8 ? await pdf.embedJpg(buffer) : await pdf.embedPng(buffer); const scale = Math.min(520 / embedded.width, 690 / embedded.height, 1); page.drawImage(embedded, { x: (595 - embedded.width * scale) / 2, y: 75, width: embedded.width * scale, height: embedded.height * scale }); const label = await renderBengaliSvg(`<rect width="1240" height="1754" fill="#1a5940"/><text x="110" y="110" font-size="38" fill="#ffffff">চা-বাগান শিক্ষা সহায়তা · ${esc(title)}</text>`, fontPath); const labelImage = await pdf.embedPng(label); page.drawImage(labelImage, { x: 0, y: 765, width: 595, height: 77 }) }
    await addImagePage('মার্কশীট', marksheet); await addImagePage('অভিভাবকের প্রমাণপত্র', proof)
    const pages = pdf.getPages(); pages.forEach((page, index) => page.drawText(`Tea Garden Education Support · ${index + 1}/${pages.length}`, { x: 42, y: 28, size: 8, color: rgb(0.38, 0.46, 0.42) }))
    const output = await pdf.save(); return new NextResponse(output, { headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(output.length), 'Content-Disposition': `attachment; filename="${id.replace(/[^a-zA-Z0-9_-]/g, '') || 'application'}.pdf"`, 'Cache-Control': 'no-store' } })
  } catch (error) { console.error('[v0] PDF generation failed', error); return NextResponse.json({ error: 'PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।' }, { status: 500 }) }
}
