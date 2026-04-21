document.addEventListener('DOMContentLoaded', function () {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Flip: every .flip trigger rotates the container another 180°.
    const container = document.querySelector('.flip-container');
    document.querySelectorAll('.flip').forEach(function (elem) {
        elem.addEventListener('click', function () {
            let deg = Number(container.getAttribute('data-degrees-rotated')) || 0;
            deg += 180;
            container.setAttribute('data-degrees-rotated', String(deg));
            container.style.transform = 'rotateY(' + deg + 'deg)';
            container.classList.toggle('showing-back');
        });
    });

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
            document.querySelector('.colors').style.backgroundColor = colors[i];
            i = (i + 1) % colors.length;
        }, 600);
    }
});
