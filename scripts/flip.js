"use strict";
document.addEventListener('DOMContentLoaded', function () {
    flipIt(".projects", ".flip-container");
    // A monodirectional flip, like a revolving door. 
    function flipIt(trigger, toBeFlipped) {
        let triggerElements = document.querySelectorAll(trigger);
        triggerElements.forEach((elem) => {
            elem.addEventListener('click', function () {
                let targetElement = document.querySelector(toBeFlipped);
                let degreesRotated = Number(targetElement.getAttribute('data-degrees-rotated')) || 0;
                degreesRotated += 180;
                targetElement.setAttribute('data-degrees-rotated', String(degreesRotated));
                targetElement.style.transform = 'rotateY(' + degreesRotated + 'deg)';
                // document.querySelector('.back')?.classList.toggle('hidden');
            });
        });
    }
    const colors = ['#00b2b2', '#b200b2', '#b2b200'];
    let i = 0;
    setInterval(() => {
        const businessCard = document.querySelector('.colors');
        businessCard.style.backgroundColor = colors[i];
        i = (i + 1) % colors.length;
    }, 100);
});
