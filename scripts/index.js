$(document).ready(function () {
  flipIt(".projects", ".card");

  /* Toggling a 'flip' class produces a back-and-forth animation.
  I wanted to create a revolving-door effect,
  so instead I increment an attribute. */
  function flipIt(trigger, element) {
    $(trigger).on('click', function () {
      var degrees = $(element).data();
      degrees.degreesRotated += 180;
      $(element).css('transform', 'rotateY(' + degrees.degreesRotated +  'deg)');
      $('.back').toggle();
    });
  }

});
