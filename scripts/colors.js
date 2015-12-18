$(document).ready(function(){
  // currently resets the entire palette
  // note: add single-color removal feature
  $('#reset').click(function () {
    $('.paint').remove();
  })

  var canvas = document.getElementById('colorcanvas');
  var ctx    = canvas.getContext('2d');
  var image  = new Image();
  image.src  = "/portfolio/assets/images/allthecolors.png";

  $(image).load(function() {
    ctx.drawImage(image,0,0);
  });

  $('#colorcanvas').click(function(event) {

    var x = event.pageX - this.offsetLeft;
    var y = event.pageY - this.offsetTop;

    var imageData = ctx.getImageData(x, y, 1, 1).data;
    var red   = imageData[0];
    var green = imageData[1];
    var blue  = imageData[2];


    function rgbToHex(red, green, blue) {
      return toHex(red)+toHex(green)+toHex(blue)
    };

  function toHex(color_value) {
    color_value = parseInt(color_value, 10);
    var hexes = "0123456789ABCDEF"
    if (isNaN(color_value)) return "00";

    color_value = Math.max(0, Math.min(color_value, 255));
    return hexes.charAt(
      (color_value-color_value % 16) / 16) + hexes.charAt(color_value % 16);
    };

    // borrowed function
    function rgb2hsv(red, green, blue) {
      //  get HSV from RGB
      var Hue = 0;
      var Sat = 0;
      var Val = 0;

      //  Convert to a percentage
      red = red / 255; green = green / 255; blue = blue / 255;
      var minRGB = Math.min(red, green, blue);
      var maxRGB = Math.max(red, green, blue);

      // Check for a grayscale image
      if (minRGB == maxRGB) {
        Val = parseInt((minRGB * 100) + .5); // Round up
        return [Hue, Sat, Val];
      }
      var d = (red == minRGB) ? green - blue : ((blue == minRGB) ? red - green : blue - red);
      var h = (red == minRGB) ? 3 : ((blue == minRGB) ? 1 : 5);

      Hue = parseInt(60 * (h - d / (maxRGB - minRGB)));
      Sat = parseInt((((maxRGB - minRGB) / maxRGB) * 100) + .5);
      Val = parseInt((maxRGB * 100) + .5); // Round up

      return [Hue, Sat, Val];
    }

    //formatting for human eyes
    var rgb = red + ',' + green + ',' + blue;
    $('#rgb').val(rgb);

    var hex = rgbToHex(red, green, blue);
    $('#hex').val('#' + hex);

    var hsv = rgb2hsv(red, green, blue);
    $('#hsv').val(hsv);

    //color palette functionality
    var paint = "<div style=color:"+'#'+hex+">"+'#'+hex+"</div>";

    $('<li class="paint" />').html(paint).appendTo("ul");
  });
});
