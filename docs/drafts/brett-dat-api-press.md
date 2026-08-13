# DRAFT (HELD) - DAT API provisioning press

**Status:** draft only. Do NOT send. Ali reviews and sends via the normal
Mandrill pipeline in the morning. Ali's standard signature appends on send.
**Suggested subject:** DAT API for Colaberry: the one input that takes sourcing live
**To:** bberry@shipces.com
**Cc:** jtheisen@shipces.com, ram@colaberry.com, karun@colaberry.com
**Bcc:** ali@colaberry.com

---

Brett,

Quick one, and it is the single thing standing between our forward-track demo and
live sourcing.

On the Jul 9 call we agreed the cleanest path is a DAT user-level API provisioned
to Colaberry, rather than us screen-scraping. That one credential unblocks two
things at once: live capacity and lane rates in the Sense layer (today we run a
deterministic mock engine), and the pricing module that sits on top of it.

Two asks:

1. Provision a DAT user-level API login for Colaberry, or tell us the exact step
   you need from us to trigger it on Jen's side. If it is faster for Jen to add
   Ali as a DAT user first, that works too.
2. Confirm the scope on that login: rate view, load posting, and capacity search.
   We flatten to DAT's posting schema on our side, so we do not need anything
   custom, just those three.

If we have this by end of week, live DAT sourcing is in the following Thursday
demo instead of the mock. If there is a billing or seat constraint on your side,
tell me and I will work around it.

Thanks,
Ali
