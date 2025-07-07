# ytfactchecker
Browser extension uses BART Hugging face model to fact check youtube video transcripts on US politics, news and medicine.
Workflow:
1. scrapes site for youtube transcript
2. determines whether the claim is fact based, a question, an opinion, etc.
3. gathers keywords from selected and adjacent lines and sends them to APIs in parallel
4. NLP considers the API responses, context, and selected line and applies a credibility score
5. if news/data APIs do not respond with any information, Bert's knowledge library is used to assess claims

Add API keys to config.js file.
Proxies enabled so free API key tiers work.
