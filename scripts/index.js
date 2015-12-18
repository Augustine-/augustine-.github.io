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

  setInterval(function(){
    var colors = [
    '#D2100B',
    '#F5892d',
    '#F5AE2D',
    '#BEC400',
    '#81BD09',
    '#078F58',
    '#077A7F',
    '#4353B7',
    '#6F47B3',
    '#AF1C08'
    ];

    for (var i = colors.length - 1; i >= 0; i--) {
      $('.business-card').css('background-color', colors[i]);
    };
  }, 500);


});
