// fence_presets.js

export const FENCE_PRESETS = {
    "wood": {
        name: "Valla Madera Clásica",
        ref: "VALMAD-01",
        price: 36, // PRECIO ACTUALIZADO
        postType: "square",
        postWidth: 0.1,
        postHeight: 1.0,
        railType: "frame",
        railShape: "square",
        railThickness: 0.08, 
        slatWidth: 0.1,
        slatThickness: 0.02,
        slatGap: 0.05,
        defaultColors: { post: 0x8D6E63, slatA: 0x8D6E63, slatB: 0x8D6E63 }
    },
    "metal_slats": {
        name: "Valla Metálica Fina",
        ref: "VALFN-01",
        price: 42, // PRECIO ACTUALIZADO
        postType: "round",
        postRadius: 0.04,
        postHeight: 1.0,
        railType: "frame",
        railShape: "round",
        railRadius: 0.03,
        slatWidth: 0.08,
        slatThickness: 0.01,
        fixedCount: 9, // <--- NUEVO: 9 lamas exactas por tramo
        multiColor: true,
        defaultColors: { post: 0x2c3e50, slatA: 0xe74c3c, slatB: 0xf1c40f, slatC: 0x3498db }
    },
    "wide_panel": {
        name: "Valla Metálica Ancha",
        ref: "VALAN-01",
        price: 45, // PRECIO ACTUALIZADO
        postType: "round",
        postRadius: 0.04,
        postHeight: 1.0,
        railType: "frame",
        railShape: "round",
        railRadius: 0.04,
        slatWidth: 0.20, // Ajustado ligeramente para que quepan 6 bien
        slatThickness: 0.02,
        fixedCount: 6, // <--- NUEVO: 6 lamas exactas por tramo
        multiColor: true,
        defaultColors: { post: 0x27ae60, slatA: 0x3498db, slatB: 0x95a5a6, slatC: 0xf1c40f }
    },
    "game_panel": {
        name: "Valla Lisa / Panel",
        ref: "VALLI-01",
        price: 61, // PRECIO ACTUALIZADO
        postType: "round",
        postRadius: 0.04,
        postHeight: 1.0,
        railType: "frame",
        railShape: "round",
        railRadius: 0.03,
        isSolidPanel: true,
        defaultColors: { post: 0xbdc3c7, slatA: 0x27ae60 }
    }
};