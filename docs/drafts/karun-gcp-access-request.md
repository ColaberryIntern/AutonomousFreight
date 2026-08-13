# DRAFT (HELD) - Karun GCP access request

**Status:** draft only. Do NOT send until Ali approves. Internal (Karun is
colaberry.com), so this is NOT a client-visible Basecamp post; send as a direct
email or message. Suggested To: karun@colaberry.com.

**Why:** to point the Autonomous Freight demo tester (and our RMS intake) at the
same real emails your system reads (QuotesTeam@shipces.com) and at the BigQuery
archive of historical RFQs, we need read access to project shipces-aixnegotiator.
The Graph email engine is already built and waiting on these credentials.

---

Karun,

I built a Microsoft Graph email engine on our side that reads the ShipCES intake
mailbox behind the same adapter contract your system uses, plus a BigQuery reader
for the archive. To light both up I need read access to your GCP project. Two
grants (or three if you want me querying BigQuery with SQL rather than table
reads):

```
gcloud projects add-iam-policy-binding shipces-aixnegotiator \
  --member="user:ali@colaberry.com" --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding shipces-aixnegotiator \
  --member="user:ali@colaberry.com" --role="roles/bigquery.dataViewer"

gcloud projects add-iam-policy-binding shipces-aixnegotiator \
  --member="user:ali@colaberry.com" --role="roles/bigquery.jobUser"
```

If you prefer least privilege: the secret accessor role can be scoped to just the
three `CES_AZURE_*` secrets, and the BigQuery viewer to just the
`shipces_analytics` dataset. Read-only is all I need; I will not touch the live
mailbox state (no category marking, no sends).

Thanks,
Ali
