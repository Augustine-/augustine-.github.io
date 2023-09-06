document.addEventListener('DOMContentLoaded', function(){
    flipIt(".flip", ".flip-container");

    // A monodirectional flip, like a revolving door. 
    function flipIt(trigger: string, toBeFlipped: string){
        let triggerElements = document.querySelectorAll(trigger);

        triggerElements.forEach((elem) => {
            elem.addEventListener('click', function(){
                let targetElement  = document.querySelector(toBeFlipped) as HTMLElement;
                let degreesRotated = Number(targetElement.getAttribute('data-degrees-rotated')) || 0;
                degreesRotated += 180;    
                targetElement.setAttribute('data-degrees-rotated', String(degreesRotated));
                targetElement.style.transform = 'rotateY(' + degreesRotated + 'deg)'; 
            })
        })
    }

    const colors = ['#00b2b2', '#b200b2', '#b2b200'];
    let i = 0;

    setInterval(() => {
        const businessCard = document.querySelector('.colors') as HTMLElement;
        businessCard.style.backgroundColor = colors[i];
        i = (i + 1) % colors.length;
    }, 100);
    
    // Text animation
    let currentDescriptionDiv;

    document.querySelectorAll('.hex').forEach((hex) => {
      hex.addEventListener('mouseover', function() {
        const projectId = this.id;
        const descriptionDiv = document.getElementById(`description-${projectId}`);
    
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

