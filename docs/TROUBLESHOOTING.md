# Troubleshooting

| Symptom | Check |
| --- | --- |
| Assistant says catalog fallback | Expected without the Gemini SDK/key/model, or after provider failure, quota/timeout/output-validation failure. Real catalog matching still works. |
| Gemini verification fails | Install `@google/genai` in backend, use an account-accessible configured model, inspect safe usage/status diagnostics and account quota. Never paste keys into chat or logs. |
| No matching dishes | Check selected city, approved/open restaurant status, item availability, diet and budget. The assistant does not invent missing food. |
| Personalized results unchanged | Sign in, explicitly opt in, and check favorites/delivered-order history. New users receive catalog ranking. |
| AI rate limit | Wait for the request window; administrators can inspect daily usage and configured caps. Do not remove limits as a workaround. |
| Admin page denied | Public signup creates CUSTOMER accounts. Use the existing explicit administrator bootstrap workflow; do not add a public privileged-role signup field. |
| Readiness 503 | Check backend/database connectivity and Atlas network access. The health response deliberately omits credentials and internal diagnostics. |
| Login works locally but not across deployed domains | Check exact HTTPS origins, credential cookies and browser third-party cookie restrictions. Prefer same-site custom frontend/API domains. |
| Next image rejects a host | Use existing local images or configured Unsplash/Cloudinary hosts. Do not allow arbitrary remote hosts. |
| Build cannot write `.next` on Windows | Stop conflicting build processes or use a separate test build directory with `FOODIEGO_BUILD_DIR=.next-phase7`. Do not delete project data or environment files. |
| Isolated E2E cannot start | Free localhost ports 3000/5000 yourself, install supported Playwright browsers and permit temporary MongoDB/Edge execution. Existing services are not killed automatically. |
| Sitemap has only public root pages | The backend may have been unavailable during generation, or all restaurants are sample records. It revalidates; private/sample business records are not published as factual restaurant listings. |

Production errors shown to customers should remain generic. Use protected operational status and sanitized server logs for diagnosis.
