# DRAFT (HELD) - Brett invoice-anatomy questionnaire

**Status:** draft only. Do NOT send. Ali reviews and sends via the normal
Mandrill pipeline in the morning. Ali's standard signature appends on send.
**Suggested subject:** BMS invoice anatomy: 8 questions so your walkthrough is one pass
**To:** bberry@shipces.com
**Cc:** ram@colaberry.com, karun@colaberry.com
**Bcc:** ali@colaberry.com

**Why this exists:** BMS (billing) is the only layer still on scaffold data. The
invoice generator works and is test-pinned, but the field-level detail
(accessorial codes, fuel model, customer overrides) is calibrated by your
invoice-anatomy walkthrough. Answering these ahead of the call makes the
walkthrough a confirmation instead of a discovery, and takes BMS from fake data
to real on the next Thursday.

---

Brett,

To make the invoice-anatomy walkthrough one pass instead of three, here are the
eight things I need from the ShipCES side. Answer inline, or we cover them live
and I take notes; either way this is the input that takes BMS billing from fake
data to real.

1. Accessorial codes. Which accessorials do you bill, and what code and label
   does each carry on a customer invoice (detention, TONU, layover, redelivery,
   lumper, driver assist, and any others)? Our line items currently bucket all
   accessorials under one code; I want your real code set.

2. Fuel surcharge model. Flat percentage of linehaul, a DOE index peg, or per
   mile? If indexed, which index and what is the peg and step. We currently model
   a flat 18 percent as a placeholder.

3. Detention terms. Free time before detention starts, the hourly rate, and any
   cap. Same for layover and TONU.

4. Customer-rule overrides. Do specific customers get different billing rules
   (their own fuel model, net terms, required PO on the invoice, consolidated
   invoicing)? A couple of concrete examples is enough.

5. Invoice format. What must appear on a Continental customer invoice for it to
   be payable (PO number, reference numbers, remit-to, tax lines, signatures)?
   A sample invoice PDF with the numbers redacted would answer this fastest.

6. EDI 210. Do any of your customers take invoices by EDI 210, or is it all PDF
   and email today? This tells us whether the 210 alignment we built is used now
   or is future.

7. Payment terms. Standard net terms, early-pay discount if any, and how a short
   pay or dispute shows up.

8. The rounding and the total line. How you round (per line or on the total), and
   whether tax or any platform fee ever appears below the subtotal.

Send whatever is quick and we will cover the rest on the call.

Thanks,
Ali
