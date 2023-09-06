document.addEventListener('DOMContentLoaded', function () {
    flipIt(".flip", ".flip-container");
    // A monodirectional flip, like a revolving door. 
    function flipIt(trigger, toBeFlipped) {
        var triggerElements = document.querySelectorAll(trigger);
        triggerElements.forEach(function (elem) {
            elem.addEventListener('click', function () {
                var targetElement = document.querySelector(toBeFlipped);
                var degreesRotated = Number(targetElement.getAttribute('data-degrees-rotated')) || 0;
                degreesRotated += 180;
                targetElement.setAttribute('data-degrees-rotated', String(degreesRotated));
                targetElement.style.transform = 'rotateY(' + degreesRotated + 'deg)';
            });
        });
    }
    var colors = ['#00b2b2', '#b200b2', '#b2b200'];
    var i = 0;
    setInterval(function () {
        var businessCard = document.querySelector('.colors');
        businessCard.style.backgroundColor = colors[i];
        i = (i + 1) % colors.length;
    }, 100);
    // Text animation
    var currentDescriptionDiv;
    document.querySelectorAll('.hex').forEach(function (hex) {
        hex.addEventListener('mouseover', function () {
            var projectId = this.id;
            var descriptionDiv = document.getElementById("description-".concat(projectId));
            if (currentDescriptionDiv) {
                currentDescriptionDiv.classList.remove('visible');
                currentDescriptionDiv.classList.add('hidden');
            }
            descriptionDiv.classList.remove('hidden');
            descriptionDiv.classList.add('visible');
            currentDescriptionDiv = descriptionDiv;
        });
    });
});
