import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type LedgerEntry = {
  id: string;
  created_at: string;
  project_title: string;
  milestone_title?: string | null;
  amount: number | string;
  transaction_type: string;
  status: string;
  razorpay_reference?: string | null;
};

const formatAmount = (value: number | string) => {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('en-IN') : '0';
};

export const exportLedgerPdf = (entries: LedgerEntry[], title = 'StayVise Ledger') => {
  const doc = new jsPDF();
  const generatedAt = format(new Date(), 'dd MMM yyyy, hh:mm a');

  doc.setFontSize(18);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(90, 98, 112);
  doc.text(`Generated ${generatedAt}`, 14, 26);

  autoTable(doc, {
    startY: 34,
    head: [['Date', 'Project', 'Milestone', 'Type', 'Status', 'Amount', 'Reference']],
    body: entries.map((entry) => [
      format(new Date(entry.created_at), 'dd MMM yyyy'),
      entry.project_title,
      entry.milestone_title || 'Across project',
      entry.transaction_type.replace(/_/g, ' '),
      entry.status,
      `Rs ${formatAmount(entry.amount)}`,
      entry.razorpay_reference || entry.id.slice(0, 8),
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [15, 110, 86],
    },
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}.pdf`);
};
