# X Integration Constraint

## Decision

Do not use recurring browser automation against the logged-in X web interface. X’s automation rules state that non-API website scripting may result in permanent account suspension.

Use manual collection until official API access is configured. For API-based ingestion:

1. Obtain explicit user approval and credentials through the X Developer Console.
2. Use incremental bookmark/timeline reads with a saved cursor or newest post timestamp.
3. Deduplicate before fetching expensive media or writing GitHub.
4. Set a per-run result cap and a monthly spend cap. Do not perform likes, follows, reposts, posts, replies, or messages.
5. Stop on HTTP 429 and obey rate-limit reset headers.

## Cost Notes

- X API uses prepaid, pay-per-use credits rather than a required monthly subscription.
- Own-bookmark reads qualify as owned reads; current published price is $0.001 per returned resource.
- Other post reads have a higher published price; limit home-timeline reads aggressively.
- Confirm live endpoint pricing and access availability in the X Developer Console before enabling the job.

## Sources

- https://help.x.com/en/rules-and-policies/x-automation?lang=browser
- https://docs.x.com/x-api/getting-started/pricing
- https://docs.x.com/x-api/fundamentals/rate-limits
