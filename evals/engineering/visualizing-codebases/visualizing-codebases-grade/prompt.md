---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite, Agent]
max_turns: 30
timeout_seconds: 900
append_system_prompt: |
  The shell, Write, and Edit tools are unavailable in this session, and the repository is not on disk. Give the content of each file you would write in the reply instead. The repository is one Node.js 20 service, `invoicing`, built with Express and deployed as a single container. It stores invoices and customers in PostgreSQL and sends invoice emails through an SMTP server. Finance staff use it over HTTPS. Its README says: "invoicing is layered. Layers, outermost first: http (src/http), application (src/invoices, src/customers), domain (src/domain), infrastructure (src/persistence, src/mail). A layer imports only itself and the layers after it." The repository has no other architecture docs and no import-rule or lint config. Its source files and their imports:
  src/http/server.js imports src/http/invoiceRoutes.js and src/http/customerRoutes.js
  src/http/invoiceRoutes.js imports src/invoices/createInvoice.js and src/invoices/sendInvoice.js
  src/http/customerRoutes.js imports src/customers/registerCustomer.js
  src/invoices/createInvoice.js imports src/domain/invoice.js, src/persistence/invoiceRepo.js, and src/customers/customerLookup.js
  src/invoices/sendInvoice.js imports src/persistence/invoiceRepo.js and src/mail/smtpClient.js
  src/customers/registerCustomer.js imports src/domain/customer.js and src/persistence/customerRepo.js
  src/customers/customerLookup.js imports src/persistence/customerRepo.js and src/invoices/sendInvoice.js
  src/domain/invoice.js imports src/domain/money.js and src/domain/customer.js
  src/domain/money.js imports nothing
  src/domain/customer.js imports nothing
  src/persistence/invoiceRepo.js imports src/persistence/pool.js and src/domain/invoice.js
  src/persistence/customerRepo.js imports src/persistence/pool.js
  src/persistence/pool.js connects to PostgreSQL
  src/mail/smtpClient.js connects to the SMTP server
  Express starts from `node src/http/server.js`.
---

Give the invoicing service's architecture a grade from A to F.
