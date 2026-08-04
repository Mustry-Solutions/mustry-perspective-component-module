// Built-in UI-text pack for the Branching Diagram. `config.locale` picks the
// default language (primary subtag, English fallback); `config.labels.*`
// overrides any single key. Re-exported through shared/labelPacks.ts.

import { primaryLang } from './common';

export interface BranchingLabels {
    /** Empty-state text when data.nodes yields no drawable tree. */
    noNodes: string;
    /** Empty-state hint when nodes exist but no root can be found. */
    noRoot: string;
}

const PACKS: { [lang: string]: BranchingLabels } = {
    en: { noNodes: 'No nodes', noRoot: 'No root node — one node must have outgoing edges and no incoming ones' },
    fr: { noNodes: 'Aucun nœud', noRoot: 'Pas de nœud racine — un nœud doit avoir des liens sortants et aucun entrant' },
    de: { noNodes: 'Keine Knoten', noRoot: 'Kein Wurzelknoten — ein Knoten braucht ausgehende, aber keine eingehenden Kanten' },
    es: { noNodes: 'Sin nodos', noRoot: 'Sin nodo raíz — un nodo debe tener enlaces salientes y ninguno entrante' },
    nl: { noNodes: 'Geen knopen', noRoot: 'Geen wortelknoop — één knoop moet uitgaande maar geen inkomende verbindingen hebben' },
    it: { noNodes: 'Nessun nodo', noRoot: 'Nessun nodo radice — un nodo deve avere collegamenti in uscita e nessuno in entrata' },
    pt: { noNodes: 'Sem nós', noRoot: 'Sem nó raiz — um nó deve ter ligações de saída e nenhuma de entrada' }
};

/** The Branching Diagram's default label set for a locale. */
export function branchingLabelBase(locale: string): BranchingLabels {
    return PACKS[primaryLang(locale)] || PACKS.en;
}

export const EN_BRANCHING_LABELS: BranchingLabels = PACKS.en;
