(function () {
    const themeToggle = document.getElementById('theme-toggle');
    const storedTheme = localStorage.getItem('theme');
    const validThemes = ['light', 'dark'];

    if (storedTheme && validThemes.includes(storedTheme)) {
        applyTheme(storedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        applyTheme('dark');
    } else {
        applyTheme('light');
    }

    if (themeToggle) {
        themeToggle.addEventListener('change', function() {
            const newTheme = this.checked ? 'dark' : 'light';
            applyTheme(newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }

    function applyTheme(theme) {
        if (!validThemes.includes(theme)) {
            console.warn(`Theme "${theme}" is not recognized. Falling back to 'light'.`);
            theme = 'light';
        }
        document.documentElement.setAttribute('data-bs-theme', theme);
        if (themeToggle) themeToggle.checked = (theme === 'dark');
    }
})();
