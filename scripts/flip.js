document.addEventListener('DOMContentLoaded', function () {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Name fade-in
    const letters = document.getElementsByClassName('title-letter');
    setTimeout(function () {
        const lastLetterIndex = letters.length - 1;
        for (let i = 0; i <= lastLetterIndex; i++) {
            setTimeout(function () {
                letters[i].classList.add('active');
                if (i === lastLetterIndex) {
                    document.getElementById('sub-title').classList.add('active');
                    document.getElementById('links').classList.add('active');
                }
            }, (prefersReducedMotion ? 0 : 60) * i);
        }
    }, prefersReducedMotion ? 0 : 500);

    // Color cycle on the card backdrop — skip entirely under reduced motion.
    if (!prefersReducedMotion) {
        const colors = ['#00b2b2', '#b200b2', '#b2b200'];
        let i = 0;
        setInterval(function () {
            const businessCard = document.querySelector('.colors');
            businessCard.style.backgroundColor = colors[i];
            i = (i + 1) % colors.length;
        }, 600);
    }
});
