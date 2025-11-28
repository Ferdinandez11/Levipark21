// --- START OF FILE theme.js ---

export const THEME = {
    // Colores de Suelos
    floor: {
        garnet: 0xA04040,
        blue: 0x2980b9,
        green: 0x27ae60,
        black: 0x2c3e50
    },
    // Colores de Ambiente
    env: {
        white: 0xffffff,
        green: 0x2ecc71,
        blue: 0x3498db,
        yellow: 0xf1c40f
    },
    // Colores de Vallas (Presets)
    fence: {
        wood: {
            post: 0x8D6E63,
            slat: 0x8D6E63
        },
        metal_slats: {
            post: 0x2c3e50,
            slatA: 0xe74c3c,
            slatB: 0xf1c40f,
            slatC: 0x3498db
        },
        wide_panel: {
            post: 0x27ae60,
            slatA: 0x3498db,
            slatB: 0x95a5a6,
            slatC: 0xf1c40f
        },
        game_panel: {
            post: 0xbdc3c7,
            slat: 0x27ae60
        }
    },
    // UI y Herramientas (Opcional, para futuro uso en CSS dinámico o Canvas)
    ui: {
        highlight: 0x4a90e2,
        warning: 0xe74c3c,
        success: 0x27ae60,
        grid: 0x888888,
        grid_secondary: 0x444444
    }
};