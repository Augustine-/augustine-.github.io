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
    /// Text animations
    // Project Description
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
    // Name fade-in
    var letters = document.getElementsByClassName('title-letter');
    setTimeout(function () {
        var lastLetterIndex = letters.length - 1;
        var _loop_1 = function (i_1) {
            setTimeout(function () {
                letters[i_1].classList.add('active');
                if (i_1 === lastLetterIndex) {
                    showSubTitle();
                    showLinks();
                }
            }, 60 * i_1);
        };
        for (var i_1 = 0; i_1 <= lastLetterIndex; i_1++) {
            _loop_1(i_1);
        }
    }, 500);
    function showSubTitle() {
        setTimeout(function () {
            document.getElementById('sub-title').classList.add('active');
        }, 1);
    }
    function showLinks() {
        setTimeout(function () {
            document.getElementById('links').classList.add('active');
        }, 1);
    }
});
