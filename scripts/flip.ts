document.addEventListener('DOMContentLoaded', function(){
    flipIt(".flip", ".flip-container");
    tidyUp();

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

    function tidyUp() {
        document.getElementById('return')?.addEventListener('click', function(){
            hideDescriptions();
        })
    }

    const colors = ['#00b2b2', '#b200b2', '#b2b200'];
    let i = 0;

    setInterval(() => {
        const businessCard = document.querySelector('.colors') as HTMLElement;
        businessCard.style.backgroundColor = colors[i];
        i = (i + 1) % colors.length;
    }, 100);
    
    /// Text animations
    
    // Project Description
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
    
    // Name fade-in
    let letters = document.getElementsByClassName('title-letter');

    setTimeout(() => {
      let lastLetterIndex = letters.length - 1;
    
      for (let i = 0; i <= lastLetterIndex; i++) {
        setTimeout(() => {
          letters[i].classList.add('active');
    
          if (i === lastLetterIndex) {
            showSubTitle();
            showLinks();
          }
        }, 60 * i);
      }
    }, 500);
    
    function showSubTitle() {
      setTimeout(() => {
        document.getElementById('sub-title').classList.add('active');
      }, 1);
    }

    function showLinks() {
        setTimeout(() => {
            document.getElementById('links').classList.add('active');
          }, 1);
    }

    function hideDescriptions() {
        let visible = document.getElementsByClassName("visible");
        
        for (var i = 0; i < visible.length; i++) {
            visible[i].classList.add('hidden');
            visible[i].classList.remove('visible');
        }
    }
});

