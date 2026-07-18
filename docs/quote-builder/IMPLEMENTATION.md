# Highway 38 Quote Builder Workspace

The Quote Builder is a dedicated client workspace inside the existing private Business Office application. It uses the shared customer, quote, quote-line, Price Book, document-template, approval, PDF, and quote-to-job records already in production.

## Access

- Public gateway: `quote-builder.html`
- Secure module: `?app=business-office#module=quoteBuilder`
- In-app navigation: Sales → Quote Builder

## Included workflows

- Quote dashboard and pipeline totals
- New quote form with customer selection and line-item calculations
- Price Book search and add-to-quote actions
- Active proposal-template list
- AI-assisted review draft staging from notes and references
- Existing quote open, duplicate, PDF, owner approval, and quote-to-job actions

## Control boundary

The workspace does not send customer communications, invent final pricing, approve itself, move money, or bypass existing owner approval controls. New quotes are created as internal drafts with owner approval required and sending disabled.
