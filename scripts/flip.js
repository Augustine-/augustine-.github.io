document.addEventListener('DOMContentLoaded', function () {
    flipIt(".projects", ".flip-container");
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
    // Project Descriptions
    document.querySelectorAll('.hex').forEach(function (hex) {
        hex.addEventListener('mouseover', function () {
            document.getElementById('project-description').innerText = 'Your description here';
        });
        hex.addEventListener('mouseout', function () {
            document.getElementById('project-description').innerText = '';
        });
    });
});
