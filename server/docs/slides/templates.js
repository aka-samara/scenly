// Ready-made decks that open without a model call. Square brackets mark what to fill in.
const deck = (title, settings, slides) => ({ title, settings, slides: slides.map(([layout, text, notes]) => ({ layout: layout || undefined, text, notes })) });

export const TEMPLATES = [
  { id: 'pitch', label: 'Pitch deck', sub: 'Problem, solution, market, traction, ask', build: (theme) => deck(`${theme.company || '[Company]'} pitch deck`, { style: 'bold' }, [
    ['title', `# ${theme.company || '[Company name]'}\n## [One sentence on what you do and for whom]`, 'Introduce yourself and say in one breath what the company does.'],
    ['content', '# [The problem, stated as the customer feels it]\n- [Who has this problem and how often]\n- [What it costs them today]\n- [Why current answers fall short]', 'Make the problem concrete with one real example.'],
    ['content', '# [Your solution in one line]\n- [What the product does]\n- [Why it is different]\n- [The result for the customer]\n<image prompt="[product picture]"/>', 'Show the product. Keep it simple.'],
    ['steps', '# How it works\n1. [Step one]: [what the customer does]\n2. [Step two]: [what the product does]\n3. [Step three]: [the outcome]', 'Walk through the three steps.'],
    ['stats', '# The market is large and growing\n<stat value="[$0bn]" label="Total market"/>\n<stat value="[$0bn]" label="Market you can reach"/>\n<stat value="[0%]" label="Yearly growth"/>\n- [Source of the figures]', 'Explain how you sized the market.'],
    ['chart', '# Traction: [headline number]\n<chart type="bar" labels="Q1,Q2,Q3,Q4" series="Revenue: 10,18,31,52" prefix="$" suffix="k"/>\n- [Customers or users today]\n- [Growth rate]\n- [A notable customer or partner]', 'Replace the chart numbers with your own.'],
    ['table', '# Business model\n| Plan | Price | For |\n|---|---|---|\n| [Starter] | [$0] | [Who] |\n| [Growth] | [$0] | [Who] |\n| [Enterprise] | [Custom] | [Who] |', 'Say how you make money and what a customer is worth.'],
    ['two-column', '# Why we win\n<left>\n### Others\n- [Weakness one]\n- [Weakness two]\n</left>\n<right>\n### Us\n- [Advantage one]\n- [Advantage two]\n</right>', 'Be fair to competitors and precise about your edge.'],
    ['content', '# The team\n- **[Name]**, [role]: [one line of relevant experience]\n- **[Name]**, [role]: [one line of relevant experience]\n- **[Name]**, [role]: [one line of relevant experience]', 'Why this team is the one to do it.'],
    ['closing', '# The ask: [amount] to [goal]\n## [What the money achieves in 18 months]\n[name@company.com] · [website]', 'State the ask plainly and stop.'],
  ]) },
  { id: 'update', label: 'Business update', sub: 'Results, highlights, risks, next quarter', build: (theme) => deck('[Quarter] business update', { style: 'clean', footer: theme.company || '' }, [
    ['title', `# [Quarter] business update\n## ${theme.company || '[Company]'} · [Date]`, 'Set the scene in one sentence.'],
    ['stats', '# The quarter in four numbers\n<stat value="[$0m]" label="Revenue"/>\n<stat value="[0%]" label="Growth on last year"/>\n<stat value="[0]" label="New customers"/>\n<stat value="[0%]" label="Gross margin"/>', 'Say which number matters most and why.'],
    ['chart', '# Revenue is [up / down] [0%] on last year\n<chart type="line" labels="Jan,Feb,Mar,Apr,May,Jun" series="This year: 12,14,15,18,21,24; Last year: 10,11,12,13,14,15"/>\n- [What drove the change]\n- [What to watch]', 'Replace the chart numbers with your own.'],
    ['content', '# Highlights\n- [Win one, with its number]\n- [Win two, with its number]\n- [Win three, with its number]', 'Give credit to the people behind each win.'],
    ['two-column', '# Risks and how we are handling them\n<left>\n### Risk\n- [Risk one]\n- [Risk two]\n</left>\n<right>\n### Response\n- [Action and owner]\n- [Action and owner]\n</right>', 'Be candid. Name owners.'],
    ['steps', '# Priorities for next quarter\n1. [Priority one]: [the measurable goal]\n2. [Priority two]: [the measurable goal]\n3. [Priority three]: [the measurable goal]', 'Each priority has one owner and one number.'],
    ['closing', '# Questions\n## [Name] · [email]', ''],
  ]) },
  { id: 'proposal', label: 'Sales proposal', sub: 'Needs, approach, timeline, price', build: (theme) => deck('Proposal for [Client]', { style: 'minimal', footer: theme.company || '' }, [
    ['title', `# Proposal for [Client]\n## [Project name] · ${theme.company || '[Your company]'} · [Date]`, ''],
    ['content', '# What you told us you need\n- [Need one, in the client\'s words]\n- [Need two]\n- [Need three]', 'Show you listened.'],
    ['content', '# Our approach\n- [What we will do]\n- [How we will work with your team]\n- [What you will have at the end]', ''],
    ['steps', '# Timeline\n1. Discover: [weeks 1 to 2, what happens]\n2. Build: [weeks 3 to 6, what happens]\n3. Launch: [week 7, what happens]\n4. Support: [after launch]', ''],
    ['table', '# Investment\n| Item | What is included | Price |\n|---|---|---|\n| [Phase one] | [Deliverables] | [0.00] |\n| [Phase two] | [Deliverables] | [0.00] |\n| **Total** | | **[0.00]** |', 'Explain what is and is not included.'],
    ['quote', '# What clients say\n> [A short quotation from a happy client.]\n-- [Name, role, company]', ''],
    ['closing', '# Next steps\n- [Step one and date]\n- [Step two and date]\n[name@company.com] · [phone]', 'Ask for the decision date.'],
  ]) },
  { id: 'project', label: 'Project kickoff', sub: 'Goals, scope, plan, roles', build: () => deck('[Project] kickoff', { style: 'clean' }, [
    ['title', '# [Project name] kickoff\n## [Date] · [Team]', ''],
    ['content', '# Why we are doing this\n- [The problem or opportunity]\n- [What success looks like]\n- [How we will measure it]', ''],
    ['two-column', '# Scope\n<left>\n### In scope\n- [Item]\n- [Item]\n</left>\n<right>\n### Out of scope\n- [Item]\n- [Item]\n</right>', 'Agree this slide before anything else.'],
    ['steps', '# Plan\n1. [Phase one]: [dates and outcome]\n2. [Phase two]: [dates and outcome]\n3. [Phase three]: [dates and outcome]\n4. [Launch]: [date]', ''],
    ['table', '# Who does what\n| Person | Role | Responsible for |\n|---|---|---|\n| [Name] | [Sponsor] | [Decisions and budget] |\n| [Name] | [Project lead] | [Plan and delivery] |\n| [Name] | [Specialist] | [Area] |', ''],
    ['content', '# Risks and open questions\n- [Risk or question one]\n- [Risk or question two]\n- [Risk or question three]', ''],
    ['closing', '# Next steps\n- [Action, owner, date]\n- [Action, owner, date]', ''],
  ]) },
  { id: 'lesson', label: 'Lesson or training', sub: 'Objectives, content, practice, recap', build: () => deck('[Topic]', { style: 'dark' }, [
    ['title', '# [Topic]\n## [Course or audience] · [Your name]', ''],
    ['content', '# By the end you will be able to\n- [Objective one]\n- [Objective two]\n- [Objective three]', 'Read the objectives aloud and come back to them at the end.'],
    ['section', '# Part 1\n## [First idea]', ''],
    ['content', '# [The first idea, as a statement]\n- [Key point]\n- [Key point]\n- [Example]', ''],
    ['steps', '# [A process to learn]\n1. [Step]: [what to do]\n2. [Step]: [what to do]\n3. [Step]: [what to do]', ''],
    ['content', '# Try it yourself\n1. [Exercise one]\n2. [Exercise two]\n3. [Discuss with a partner: question]', 'Give five minutes, then take answers.'],
    ['closing', '# Recap\n- [Takeaway one]\n- [Takeaway two]\n- [Takeaway three]', 'Link each takeaway back to an objective.'],
  ]) },
];
