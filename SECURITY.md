# Security Policy

## Supported versions

The latest version on the default branch is the primary supported development version.

## Reporting a vulnerability

Please do not post credentials, bot tokens, API keys, or exploitable details in a public issue. Contact the repository maintainers privately through GitHub's available security reporting options.

## Operational security

- Keep `.env` out of version control.
- Use a bot token dedicated to this application and rotate it immediately if exposed.
- Grant only the Discord permissions the bot actually needs.
- Keep Node.js and dependencies updated.
- Do not enable privileged Discord intents unless a documented feature requires them.
- Treat AI provider output as untrusted user-facing content.
