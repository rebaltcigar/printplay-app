import React from 'react';
import ReactDOM from 'react-dom';
import { Box, Typography, Divider, Table, TableHead, TableBody, TableRow, TableCell } from '@mui/material';

// Helper for currency format
const currency = (num) => `₱${Number(num || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ServiceInvoice = ({ order, settings }) => {
    if (!order) return null;

    // Default Settings
    const storeName = settings?.storeName || 'PrintPlay';
    const address = settings?.address || '6 Abra St. Bago Bantay, Quezon City'; // Main/Registered Address
    const phone = settings?.phone || '';
    const mobile = settings?.mobile || '';
    const email = settings?.email || '';
    const tin = settings?.tin || ''; // Now uses setting or empty
    const logoUrl = settings?.logoUrl || null;

    // Derived Data
    const orderId = order.orderNumber || order.id || "---";
    const dateStr = order.timestamp?.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Customer
    const custName = order.customerName || '';
    const custAddr = order.customerAddress || '-';
    const custTin = order.customerTin || '-';
    // Removed custStyle

    const mountNode = document.body;

    return ReactDOM.createPortal(
        <Box
            id="printable-invoice"
            sx={{
                display: 'none',
                '@media print': {
                    display: 'block',
                    backgroundColor: 'white',
                    color: 'black',
                    zIndex: 99999,
                },
            }}
        >
            <style>
                {`
          @media print {
            @page {
              size: Letter;
              margin: 0; /* We handle margins manually to support fixed headers */
            }
            
            body > * { display: none !important; }
            body > #printable-invoice { display: block !important; }

            /* Reset Body */
            body, html {
              margin: 0 !important;
              padding: 0 !important;
              height: auto !important;
              width: 100% !important;
              background-color: white !important;
              overflow: visible !important;
            }

            /* --- LAYOUT GRID --- */
            #invoice-container {
              width: 8.5in;
              /* REMOVED min-height: 11in to prevent forcing 2nd page if not needed */
              /* min-height: 11in; */ 
              position: relative;
              margin: 0 auto;
              font-family: "Arial", sans-serif; /* Clean font for invoice */
              box-sizing: border-box;
            }

            /* --- FIXED HEADER --- */
            header {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              width: 100%;
              height: 160px; /* Adjusted for 0.5in margins */
              padding: 0.5in; /* Standard margins on all sides */
              background: white;
              z-index: 100;
            }

            /* --- FIXED FOOTER --- */
            footer {
              position: fixed;
              bottom: 0;
              left: 0;
              width: 100%;
              height: 100px; /* Adjust based on content */
              padding: 0 0.5in 0.5in 0.5in;
              background: white;
              z-index: 100;
            }

            /* --- MAIN CONTENT FLOW --- */
            main {
              margin-top: 160px; /* Match Adjusted Header Height */
              margin-bottom: 50px;
              padding: 0 0.5in;
              width: 100%;
              /* FLEX to push signature down if content is short on page 1 */
              display: flex;
              flex-direction: column;
              /* min-height removed to fix 2nd page issue */
            }

            /* --- TYPOGRAPHY UTILS --- */
            .label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #444; }
            .value { font-size: 11px; font-weight: normal; color: black; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
            .title { font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
            .sub-title { font-size: 14px; font-weight: bold; }
            .disclaimer { font-size: 9px; font-weight: bold; text-align: center; margin-top: 5px; }

            /* --- TABLE STYLES --- */
            table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
            th { border-bottom: 2px solid black; text-align: left; font-size: 10px; padding: 5px; font-weight: 800; }
            td { border-bottom: 1px solid #eee; font-size: 11px; padding: 5px; vertical-align: top; }
            .currency-col { text-align: right; }
          }
        `}
            </style>

            <div id="invoice-container">
                {/* --- HEADER --- */}
                <header>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        {/* LOGO & COMPANY INFO */}
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            {logoUrl && (
                                <img src={logoUrl} alt="Logo" style={{ height: '60px', width: 'auto', objectFit: 'contain' }} />
                            )}
                            <Box>
                                <Typography variant="h5" sx={{ fontWeight: 900, fontSize: '22px', textTransform: 'uppercase', lineHeight: 1 }}>
                                    {storeName}
                                </Typography>
                                <Typography sx={{ fontSize: '11px', whiteSpace: 'pre-line', lineHeight: 1.2, mt: 0.5 }}>
                                    {address}
                                </Typography>
                                {(phone || mobile || email) && (
                                    <Typography sx={{ fontSize: '11px', mt: 0.25 }}>
                                        {[
                                            phone && `Tel: ${phone}`,
                                            mobile && `Mobile: ${mobile}`,
                                            email && `Email: ${email}`
                                        ].filter(Boolean).join(' | ')}
                                    </Typography>
                                )}
                                {tin && (
                                    <Typography sx={{ fontSize: '11px', fontWeight: 'bold', mt: 1 }}>
                                        NON-VAT REG TIN: {tin}
                                    </Typography>
                                )}
                            </Box>
                        </Box>

                        {/* INVOICE TITLE & NO */}
                        <Box sx={{ textAlign: 'right' }}>
                            <Typography className="title" sx={{ color: 'black', fontSize: '22px', lineHeight: 1 }}>SERVICE INVOICE</Typography>
                            <Typography sx={{ fontSize: '14px', color: 'red', fontWeight: 'bold', mt: 0.5 }}>
                                No. {orderId}
                            </Typography>
                            <Typography sx={{ fontSize: '12px', mt: 0.25 }}>
                                Date: <b>{dateStr}</b>
                            </Typography>
                        </Box>
                    </Box>

                    {/* CUSTOMER INFO (Part of Header to repeat on pages? 
                NO, User usually wants customer info only on first page, but 'fixed' header repeats.
                We will put generic headers here, but let's put customer info in MAIN for now to verify paginagion flow specific to items.
                Actually, standard invoice usually has 'Sold To' on top. If fixed header is used, it repeats.
                Let's move Customer Info to MAIN to avoid taking up too much fixed space on page 2+.
            ) */}
                </header>

                {/* --- FOOTER --- */}
                <footer>
                    <Box sx={{ borderTop: '2px solid black', pt: 1, textAlign: 'center' }}>
                        <Typography className="disclaimer">
                            "THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX"
                        </Typography>
                        <Typography sx={{ fontSize: '9px', fontWeight: 'bold', mt: 0.5, color: '#333', textTransform: 'uppercase' }}>
                            Internet Cafe | Gaming | Document and Photo Printing | Photocopying | Document Scanning | Laminating Services | And More!
                        </Typography>
                    </Box>
                </footer>

                {/* --- CONTENT --- */}
                <main>
                    {/* CUSTOMER INFO (First Page Only naturally creates flow) */}
                    <Box sx={{ display: 'flex', mb: 3, border: '1px solid #ccc', p: 1.5, borderRadius: '4px' }}>
                        <Box sx={{ flex: 1 }}>
                            <Typography className="label">Sold To:</Typography>
                            <Typography className="value">{custName || '_________________________'}</Typography>
                            <Typography className="label" sx={{ mt: 1 }}>Address:</Typography>
                            <Typography className="value">{custAddr}</Typography>
                        </Box>
                        <Box sx={{ width: '30%', ml: 2 }}>
                            <Typography className="label">TIN:</Typography>
                            <Typography className="value">{custTin}</Typography>
                        </Box>
                    </Box>

                    {/* ITEMS TABLE */}
                    <table className="invoice-table">
                        <thead>
                            <tr>
                                <th style={{ width: '10%' }}>QTY</th>
                                <th style={{ width: '10%', textAlign: 'left' }}>UNIT</th>
                                <th style={{ width: '50%' }}>DESCRIPTION</th>
                                <th style={{ width: '15%', textAlign: 'right' }}>UNIT PRICE</th>
                                <th style={{ width: '15%', textAlign: 'right' }}>AMOUNT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((item, idx) => (
                                <tr key={idx}>
                                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                    <td style={{ textAlign: 'left' }}>{item.unit || 'pc'}</td>
                                    <td>{item.name} {item.description && <span style={{ fontSize: '9px', display: 'block', color: '#666' }}>{item.description}</span>}</td>
                                    <td className="currency-col">{currency(item.price)}</td>
                                    <td className="currency-col">{currency(item.total)}</td>
                                </tr>
                            ))}

                            {/* FILLER ROWS (Optional: to push totals down if needed, but standard flow is better) */}
                        </tbody>
                    </table>

                    {/* TOTALS SECTION (Flows after table) */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Box sx={{ width: '40%' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography sx={{ fontSize: '11px', fontWeight: 'bold' }}>Total Sales (Non-VAT)</Typography>
                                <Typography sx={{ fontSize: '11px', fontWeight: 'bold' }}>{currency(order.total)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography sx={{ fontSize: '11px' }}>Less: VAT</Typography>
                                <Typography sx={{ fontSize: '11px' }}>0.00</Typography>
                            </Box>
                            <Divider sx={{ my: 0.5 }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography sx={{ fontSize: '14px', fontWeight: '900' }}>TOTAL AMOUNT DUE</Typography>
                                <Typography sx={{ fontSize: '14px', fontWeight: '900' }}>{currency(order.total)}</Typography>
                            </Box>
                        </Box>
                    </Box>

                    {/* SIGNATURES - Pushed to bottom of flex container (page 1) or end of flow */}
                    {/* SIGNATURES - Customer Only, More Spacing */}
                    <Box sx={{ mt: 8, display: 'flex', justifyContent: 'flex-end', pr: 4 }}>
                        <Box sx={{ width: '40%', textAlign: 'center' }}>
                            <Box sx={{ borderBottom: '1px solid black', height: '30px', mb: 0.5 }}></Box>
                            <Typography sx={{ fontSize: '10px' }}>Customer's Signature</Typography>
                        </Box>
                    </Box>

                </main>
            </div>
        </Box>,
        mountNode
    );
};
