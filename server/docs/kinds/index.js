import word from './word.js';
import sheet from './sheet.js';
import pdf from './pdf.js';
import slides from './slides.js';

// Document types Docs Studio can build, in the order they are offered.
export const KINDS = { word, sheet, pdf, slides };
export const kindList = () => Object.values(KINDS).map((k) => ({ id: k.id, label: k.label, noun: k.noun, ext: k.ext, icon: k.icon, formats: k.formats.map(({ id, label, sub, compare }) => ({ id, label, sub, compare: compare || undefined })), suggestions: k.suggestions || [], templates: k.templates || [], imports: k.imports || [], merge: !!k.merge }));
