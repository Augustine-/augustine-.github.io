$(function(e){

  var thisGame = new Hanoi.Game();
  var $sourceTower = null
  var $destinationTower = null
  $(".tower").on("click", handleClick);

  function handleClick(event){

    if($sourceTower){
      $destinationTower = $(event.currentTarget);
      $sourceTower.attr('class', 'tower');

      thisGame.takeTurn(+$sourceTower.attr('id'), +$destinationTower.attr('id'))
      $sourceTower= null;
      render();
    }else{
      $sourceTower = $(event.currentTarget);
      $sourceTower.attr('class', 'highTower');
    }
  }

  function render(){
    var divs = [[,,],[,,],[,,]]
    var BLOCKS = {undefined:"empty", 1:"one", 2:"two", 3:"three"}

    for(var i=0; i<3; i++){
      $currentTower = $("#"+i)
      $currentTower.find("[data-tier=bot]").attr('class', BLOCKS[thisGame.towers[i][0]])
      $currentTower.find("[data-tier=mid]").attr('class', BLOCKS[thisGame.towers[i][1]])
      $currentTower.find("[data-tier=top]").attr('class', BLOCKS[thisGame.towers[i][2]])
    }
  }
})
