# Agent Guidelines

## Must-run commands before PR
Run the same commands as the CI workflow before opening a PR:

```bash
ruff check .
pytest -q
```

## Secrets & safety
- **Do not commit secrets** (API keys, tokens, OAuth credentials, or PII).
- Store Streamlit secrets locally in `.streamlit/secrets.toml` (gitignored).
- Use example/template files for sharing configuration defaults.
