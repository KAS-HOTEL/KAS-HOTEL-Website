# Transactional email designs (Brevo fallback)

Email is delivered through **Brevo only** (`BrevoEmailClient`).

For each email key (`EmailTemplates.VARIABLES`):

1. If `BREVO_TEMPLATE_{KEY}_{VI|EN}` holds a Brevo template id, Brevo sends that template
   and the values arrive as `{{ params.name }}`.
2. Otherwise the design in this folder is filled in and sent: `{KEY}_{VI|EN}.html` and
   `{KEY}_{VI|EN}.subject.txt`, variables written `{{{name}}}`. Values are HTML escaped.
3. With neither, the email stays queued (`TEMPLATE_NOT_CONFIGURED`) and is sent once a
   template id or design exists. The startup line `Email delivery: … templateIdsMissing=…`
   lists the keys that have no Brevo id.

When a Brevo template changes, keep the copy here in step (replace `{{ params.x }}` with
`{{{x}}}`). `EmailTemplatesTest` fails if a file here uses a variable the code does not send
or still uses the Brevo `params.` syntax.
