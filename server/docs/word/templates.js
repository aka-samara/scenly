// Ready-made Word documents. They open at once (no model call) and are then tailored by prompt or by hand.
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const co = (t) => t.company || '[Your Company]';

export const TEMPLATES = [
  { id: 'proposal', label: 'Business proposal', sub: 'Cover page, summary, scope, timeline, pricing table',
    build: (t) => ({ title: 'Proposal for [Client Name]', settings: { cover: { subtitle: 'Prepared for [Client Name]', organisation: co(t), date: true }, toc: true, pageNumbers: true, header: '{title}' }, body: `# Proposal for [Client Name]

## Executive summary

[Client Name] wants to [goal in one sentence]. ${co(t)} proposes to [solution in one sentence], delivered over [duration], for a fixed fee of [amount].

This proposal sets out our understanding of the need, the work we will do, the timeline and the price.

## Understanding of your needs

- [Need or problem 1]
- [Need or problem 2]
- [Need or problem 3]

## Proposed solution

[Describe the approach in two or three paragraphs: what will be delivered, how, and why this approach suits the client.]

### Deliverables

1. [Deliverable 1]
2. [Deliverable 2]
3. [Deliverable 3]

## Timeline

| Phase | Work | Duration |
|:------|:-----|---------:|
| 1. Discovery | [Workshops, review of current state] | [2 weeks] |
| 2. Delivery | [Build, review rounds] | [6 weeks] |
| 3. Handover | [Training, documentation] | [1 week] |

## Pricing

| Item | Price |
|:-----|------:|
| [Phase 1] | [amount] |
| [Phase 2] | [amount] |
| [Phase 3] | [amount] |
| **Total** | **[amount]** |

Prices exclude taxes. This proposal is valid for 30 days from ${today()}.

## Why ${co(t)}

[Two or three short points: relevant experience, similar clients, the team.]

## Next steps

1. Confirm the scope and the start date.
2. Sign the attached agreement.
3. Kick-off meeting in the week of [date].

## Acceptance

Accepted for [Client Name]:

Name: ______________________  Signature: ______________________  Date: ____________
` }) },
  { id: 'contract', label: 'Service agreement', sub: 'Parties, services, fees, term, liability, signatures',
    build: (t) => ({ title: 'Service Agreement', settings: { pageNumbers: true, footer: 'Service Agreement', theme: { fontSize: 10.5 } }, body: `# Service Agreement

This agreement is made on ${today()} between:

1. **${co(t)}**, of ${t.address || '[address]'} (the "Supplier"); and
2. **[Client legal name]**, of [address] (the "Client").

## 1. Services

1.1 The Supplier will provide the services described in Schedule 1 (the "Services").

1.2 The Supplier will perform the Services with reasonable skill and care.

## 2. Fees and payment

2.1 The Client will pay the fees set out in Schedule 1.

2.2 Invoices are payable within [30] days of the invoice date.

2.3 Late payments bear interest at [rate]% a year above the base rate.

## 3. Term and termination

3.1 This agreement starts on [start date] and continues for [12 months] unless ended earlier under this clause.

3.2 Either party may end this agreement by giving [30] days' written notice.

3.3 Either party may end this agreement at once if the other commits a material breach and does not put it right within [14] days of being asked to.

## 4. Confidentiality

Each party will keep the other's confidential information secret and use it only to perform this agreement. This duty continues for [3] years after the agreement ends.

## 5. Intellectual property

On payment in full, the Supplier assigns to the Client the rights in the deliverables created specifically for the Client. The Supplier keeps its pre-existing materials and know-how.

## 6. Liability

6.1 Neither party limits liability for death or personal injury caused by negligence, or for fraud.

6.2 Subject to clause 6.1, each party's total liability under this agreement is limited to the fees paid in the [12] months before the claim.

## 7. General

7.1 This agreement is the whole agreement between the parties about its subject.

7.2 Changes must be in writing and signed by both parties.

7.3 This agreement is governed by the law of [jurisdiction].

## Signatures

| For the Supplier | For the Client |
|:-----------------|:---------------|
| Name: | Name: |
| Title: | Title: |
| Signature: | Signature: |
| Date: | Date: |

[[pagebreak]]

## Schedule 1: Services and fees

| Service | Description | Fee |
|:--------|:------------|----:|
| [Service 1] | [What is included] | [amount] |
| [Service 2] | [What is included] | [amount] |

*This template is a starting point and is not legal advice. Have it reviewed before signing.*
` }) },
  { id: 'report', label: 'Report', sub: 'Cover page, contents, findings, recommendations',
    build: (t) => ({ title: '[Report Title]', settings: { cover: { subtitle: '[Subtitle or period covered]', author: '[Author]', organisation: t.company || undefined, date: true }, toc: true, pageNumbers: true, header: '{title}' }, body: `# [Report Title]

## Executive summary

[Three to five sentences: why this report was written, the main findings and what you recommend.]

## Background

[The context a reader needs: what was examined, over what period, and how.]

## Findings

### [Finding 1]

[What was found, with the evidence.][^1]

### [Finding 2]

[What was found, with the evidence.]

| Measure | Previous | Current | Change |
|:--------|---------:|--------:|-------:|
| [Measure 1] | [value] | [value] | [+/- %] |
| [Measure 2] | [value] | [value] | [+/- %] |

### [Finding 3]

[What was found, with the evidence.]

## Recommendations

1. **[Recommendation 1].** [Why, and what it would take.]
2. **[Recommendation 2].** [Why, and what it would take.]
3. **[Recommendation 3].** [Why, and what it would take.]

## Next steps

| Action | Owner | By when |
|:-------|:------|:--------|
| [Action 1] | [Name] | [Date] |
| [Action 2] | [Name] | [Date] |

[^1]: [Source or note for this finding.]
` }) },
  { id: 'cv', label: 'CV / résumé', sub: 'One or two pages: profile, experience, education, skills',
    build: () => ({ title: '[Your Name]', settings: { page: { margins: 'moderate' }, theme: { fontSize: 10.5 } }, body: `# [Your Name]

[[center]] [City, Country] | [phone] | [email] | [linkedin.com/in/you]

## Profile

[Two or three lines: who you are professionally, your strongest results, and the role you are looking for.]

## Experience

### [Job title], [Employer]
*[Month Year] to present · [City]*

- [Result you achieved, with a number: "Grew X by 30% in 12 months by doing Y"]
- [Responsibility or project, and its outcome]
- [Another result]

### [Job title], [Employer]
*[Month Year] to [Month Year] · [City]*

- [Result you achieved, with a number]
- [Responsibility or project, and its outcome]

## Education

### [Degree], [University]
*[Year] to [Year]* · [Grade or honours, if strong]

## Skills

- **[Area 1]:** [skill, skill, skill]
- **[Area 2]:** [skill, skill, skill]
- **Languages:** [Language (level), Language (level)]

## Certifications

- [Certification], [Issuer], [Year]
` }) },
  { id: 'letter', label: 'Business letter', sub: 'Letterhead, address block, body, sign-off. Ready for mail merge',
    build: (t) => ({ title: 'Letter', settings: { page: { margins: 'normal' } }, body: `# ${co(t)}

[[right]] ${[t.address, t.phone, t.email].filter(Boolean).join(' | ') || '[Your address] | [phone] | [email]'}

[[right]] ${today()}

**{{Name}}**
{{Company}}
{{Address}}

Dear {{Name}},

**Re: [Subject of the letter]**

[Opening paragraph: why you are writing.]

[Middle paragraph: the details the reader needs.]

[Closing paragraph: what you would like the reader to do next, and by when.]

Yours sincerely,

[Your name]
[Your title]
` }) },
];
