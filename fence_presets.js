// fence_presets.js
import { THEME } from './theme.js';

export const FENCE_PRESETS = {
    "wood": {
        name: "Valla Madera Clásica",
        ref: "VALMAD-01",
        price: 36,
        postType: "square",
        postWidth: 0.1,
        postHeight: 1.0,
        railType: "frame",
        railShape: "square",
        railThickness: 0.08, 
        slatWidth: 0.1,
        slatThickness: 0.02,
        slatGap: 0.05,
        defaultColors: { 
            post: THEME.fence.wood.post, 
            slatA: THEME.fence.wood.slat, 
            slatB: THEME.fence.wood.slat 
        }
    },
    "metal_slats": {
        name: "Valla Metálica Fina",
        ref: "VALFN-01",
        price: 42,
        postType: "round",
        postRadius: 0.04,
        postHeight: 1.0,
        railType: "frame",
        railShape: "round",
        railRadius: 0.03,
        slatWidth: 0.08,
        slatThickness: 0.01,
        fixedCount: 9,
        multiColor: true,
        defaultColors: { 
            post: THEME.fence.metal_slats.post, 
            slatA: THEME.fence.metal_slats.slatA, 
            slatB: THEME.fence.metal_slats.slatB, 
            slatC: THEME.fence.metal_slats.slatC 
        }
    },
    "wide_panel": {
        name: "Valla Metálica Ancha",
        ref: "VALAN-01",
        price: 45,
        postType: "round",
        postRadius: 0.04,
        postHeight: 1.0,
        railType: "frame",
        railShape: "round",
        railRadius: 0.04,
        slatWidth: 0.20,
        slatThickness: 0.02,
        fixedCount: 6,
        multiColor: true,
        defaultColors: { 
            post: THEME.fence.wide_panel.post, 
            slatA: THEME.fence.wide_panel.slatA, 
            slatB: THEME.fence.wide_panel.slatB, 
            slatC: THEME.fence.wide_panel.slatC 
        }
    },
    "game_panel": {
        name: "Valla Lisa / Panel",
        ref: "VALLI-01",
        price: 61,
        postType: "round",
        postRadius: 0.04,
        postHeight: 1.0,
        railType: "frame",
        railShape: "round",
        railRadius: 0.03,
        isSolidPanel: true,
        slatWidth: 1.0, // Base para el cálculo de escala, no crítico
        slatThickness: 0.02, // <--- ESTO ARREGLA EL "CUBO GIGANTE", ahora es fino (2cm)
        defaultColors: { 
            post: THEME.fence.game_panel.post, 
            slatA: THEME.fence.game_panel.slat 
        }
    }
};