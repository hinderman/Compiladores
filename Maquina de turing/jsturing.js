var nDebugLevel = 0;
var bFullSpeed = false;
var bIsReset = false;
var sTape = "";
var nTapeOffset = 0;
var nHeadPosition = 0;
var sState = "0";
var nSteps = 0;
var nVariant = 0;
var hRunTimer = null;
var aProgram = new Object();
var nMaxUndo = 10;
var aUndoList = [];
var nTextareaLines = -1;
var oTextarea;
var bIsDirty = true;
var oNextLineMarker = $("<div class='NextLineMarker'>Next<div class='NextLineMarkerEnd'></div></div>");
var oPrevLineMarker = $("<div class='PrevLineMarker'>Prev<div class='PrevLineMarkerEnd'></div></div>");
var oPrevInstruction = null;
var sPreviousStatusMsg = ""; 

function Step(){
	if( bIsDirty) Compile();
	bIsReset = false;
	if( sState.substring(0,4).toLowerCase() == "halt" ) {
		SetStatusMessage( "Halted." );
		EnableControls( false, false, false, true, true, true, true );
		return( false );
	}
	var sNewState, sNewSymbol, nAction, nLineNumber;
	var sHeadSymbol = GetTapeSymbol( nHeadPosition );
	var aInstructions = GetNextInstructions( sState, sHeadSymbol );
	var oInstruction;
	if( aInstructions.length == 0 ) {
    oInstruction = null;
	} else if( nVariant == 2 ) {
    oInstruction = aInstructions[Math.floor(Math.random()*aInstructions.length)];
	} else {
    oInstruction = aInstructions[0];
	}
	
	if( oInstruction != null ) {
		sNewState = (oInstruction.newState == "*" ? sState : oInstruction.newState);
		sNewSymbol = (oInstruction.newSymbol == "*" ? sHeadSymbol : oInstruction.newSymbol);
		nAction = (oInstruction.action.toLowerCase() == "r" ? 1 : (oInstruction.action.toLowerCase() == "l" ? -1 : 0));
    if( nVariant == 1 && nHeadPosition == 0 && nAction == -1 ) {
      nAction = 0;
    }
		nLineNumber = oInstruction.sourceLineNumber;
	} else {
		debug( 1, "Advertencia: ninguna instrucción encontrada para el estado '" + sState + "' simbolo '" + sHeadSymbol + "'; halting" );
		SetStatusMessage( "Detenido. Ninguna regla para el estado '" + sState + "' y simbolo '" + sHeadSymbol + "'.", 2 );
		sNewState = "halt";
		sNewSymbol = sHeadSymbol;
		nAction = 0;
		nLineNumber = -1;
	}
	
  if( nMaxUndo > 0 ) {
    if( aUndoList.length >= nMaxUndo ) aUndoList.shift();
    aUndoList.push({state: sState, position: nHeadPosition, symbol: sHeadSymbol});
  }
	
	SetTapeSymbol( nHeadPosition, sNewSymbol );
	sState = sNewState;
	nHeadPosition += nAction;
	
	nSteps++;
	
	oPrevInstruction = oInstruction;
	
	debug( 4, "Step() terminado. Nueva cinta: '" + sTape + "'  Nuevo estado: '" + sState + "'  acción: " + nAction + "  número de línea: " + nLineNumber  );
	UpdateInterface();
	
	if( sNewState.substring(0,4).toLowerCase() == "halt" ) {
		if( oInstruction != null ) {
			SetStatusMessage( "Halted." );
		} 
		EnableControls( false, false, false, true, true, true, true );
		return( false );
	} else {
		if( oInstruction.breakpoint ) {
			SetStatusMessage( "Detenido en el punto de interrupción en línea " + (nLineNumber+1) );
			EnableControls( true, true, false, true, true, true, true );
			return( false );
		} else {
			return( true );
		}
	}
}

function Undo(){
  var oUndoData = aUndoList.pop();
  if( oUndoData ) {
    nSteps--;
    sState = oUndoData.state;
    nHeadPosition = oUndoData.position;
    SetTapeSymbol( nHeadPosition, oUndoData.symbol );
    oPrevInstruction = null;
    debug( 3, "Desecho un paso. Nuevo estado: '" + sState + "' posición : " + nHeadPosition + " símbolo: '" + oUndoData.symbol + "'" );
    EnableControls( true, true, false, true, true, true, true );
    SetStatusMessage( "Desecho un paso.");
    UpdateInterface();
  } else {
    debug( 1, "Advertencia: Se ha intentado deshacer sin datos de deshacer disponibles" );
  }
}

function Run(){
  var bContinue = true;
  if( bFullSpeed ) {
    for( var i = 0; bContinue && i < 25; i++ ) {
      bContinue = Step();
    }
    if( bContinue ) hRunTimer = window.setTimeout( Run, 10 );
    else UpdateInterface();
  } else {
    if( Step() ) {
      hRunTimer = window.setTimeout( Run, 50 );
    }
  }
}

function RunStep(){
	if( !Step() ) {
		StopTimer();
	}
}

function StopTimer(){
	if( hRunTimer != null ) {
		window.clearInterval( hRunTimer );
		hRunTimer = null;
	}
}

function Reset(){
	var sInitialTape = $("#InitialInput")[0].value;
	nHeadPosition = sInitialTape.indexOf( "*" );
	if( nHeadPosition == -1 ) nHeadPosition = 0;
	sInitialTape = sInitialTape.replace( /\*/g, "" ).replace( / /g, "_" );
	if( sInitialTape == "" ) sInitialTape = " ";
	sTape = sInitialTape;
	nTapeOffset = 0;
	var sInitialState = $("#InitialState")[0].value;
	sInitialState = $.trim( sInitialState ).split(/\s+/)[0];
	if( !sInitialState || sInitialState == "" ) sInitialState = "0";
	sState = sInitialState;
  var dropdown = $("#MachineVariant")[0];
  nVariant = Number(dropdown.options[dropdown.selectedIndex].value);
  SetupVariantCSS();
	
	nSteps = 0;
	bIsReset = true;
	
	Compile();
	oPrevInstruction = null;
	
	aUndoList = [];
	
	ShowResetMsg(false);
	EnableControls( true, true, false, true, true, true, false );
	UpdateInterface();
}

function createTuringInstructionFromTuple( tuple, line ){
	return {
		newSymbol: tuple.newSymbol,
		action: tuple.action,
		newState: tuple.newState,
		sourceLineNumber: line,
		breakpoint: tuple.breakpoint
	};
}

function Compile(){
	var sSource = oTextarea.value;
	debug( 2, "Compile()" );
	
	SetSyntaxMessage( null );
	ClearErrorLines();
	
	aProgram = new Object;
	
	sSource = sSource.replace( /\r/g, "" );
	
	var aLines = sSource.split("\n");
	for( var i = 0; i < aLines.length; i++ )
	{
		var oTuple = ParseLine( aLines[i], i );
		if( oTuple.isValid ) {
			debug( 5, " Parsed tuple: '" + oTuple.currentState + "'  '" + oTuple.currentSymbol + "'  '" + oTuple.newSymbol + "'  '" + oTuple.action + "'  '" + oTuple.newState + "'" );
			if( aProgram[oTuple.currentState] == null ) aProgram[oTuple.currentState] = new Object;
			if( aProgram[oTuple.currentState][oTuple.currentSymbol] == null ) {
        aProgram[oTuple.currentState][oTuple.currentSymbol] = [];
			}
			if( aProgram[oTuple.currentState][oTuple.currentSymbol].length > 0 && nVariant != 2 ) {
        debug( 1, "Advertencia: varias definiciones de estado '" + oTuple.currentState + "' símbolo '" + oTuple.currentSymbol + "' en la linea " + (aProgram[oTuple.currentState][oTuple.currentSymbol][0].sourceLineNumber+1) + " y " + (i+1) );
        SetSyntaxMessage( "Advertencia: varias definiciones de estado '" + oTuple.currentState + "' símbolo '" + oTuple.currentSymbol + "' en la linea " + (aProgram[oTuple.currentState][oTuple.currentSymbol][0].sourceLineNumber+1) + " y " + (i+1) );
        SetErrorLine( i );
        SetErrorLine( aProgram[oTuple.currentState][oTuple.currentSymbol][0].sourceLineNumber );
        aProgram[oTuple.currentState][oTuple.currentSymbol][0] = createTuringInstructionFromTuple( oTuple, i );
			} else {
        aProgram[oTuple.currentState][oTuple.currentSymbol].push( createTuringInstructionFromTuple( oTuple, i ) );
      }
		}
		else if( oTuple.error )
		{
			debug( 2, "Syntax error: " + oTuple.error );
			SetSyntaxMessage( oTuple.error );
			SetErrorLine( i );
		}
	}
	
	oRegExp = new RegExp( ";.*\\$DEBUG: *(.+)" );
	aResult = oRegExp.exec( sSource );
	if( aResult != null && aResult.length >= 2 ) {
		var nNewDebugLevel = parseInt( aResult[1] );
		if( nNewDebugLevel != nDebugLevel ) {
			nDebugLevel = parseInt( aResult[1] );
			debug( 1, "Setting debug level to " + nDebugLevel );
			if( nDebugLevel > 0 ) $(".DebugClass").toggle( true );
		}
	}
	
	oPrevInstruction = null;
	
	bIsDirty = false;
	
	UpdateInterface();
}

function ParseLine( sLine, nLineNum ){
	debug( 5, "ParseLine( " + sLine + " )" );
	sLine = sLine.split( ";", 1 )[0];
	var aTokens = sLine.split(/\s+/);
	aTokens = aTokens.filter( function (arg) { return( arg != "" ) ;} );

	var oTuple = new Object;
	
	if( aTokens.length == 0 )
	{
		oTuple.isValid = false;
		return( oTuple );
	}
	
	oTuple.currentState = aTokens[0];
	
	if( aTokens.length < 2 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error en la linea " + (nLineNum + 1) + ": missing &lt;current symbol&gt;!" ;
		return( oTuple );
	}
	if( aTokens[1].length > 1 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error en la linea " + (nLineNum + 1) + ": &lt;current symbol&gt; should be a single character!" ;
		return( oTuple );
	}
	oTuple.currentSymbol = aTokens[1];
	
	if( aTokens.length < 3 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error en la linea " + (nLineNum + 1) + ": missing &lt;new symbol&gt;!" ;
		return( oTuple );
	}
	if( aTokens[2].length > 1 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error en la linea " + (nLineNum + 1) + ": &lt;new symbol&gt; should be a single character!" ;
		return( oTuple );
	}
	oTuple.newSymbol = aTokens[2];
	
	if( aTokens.length < 4 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error en la linea " + (nLineNum + 1) + ": missing &lt;direction&gt;!" ;
		return( oTuple );
	}
	if( ["l","r","*"].indexOf( aTokens[3].toLowerCase() ) < 0 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error en la linea " + (nLineNum + 1) + ": &lt;direction&gt; should be 'l', 'r' or '*'!";
		return( oTuple );
	}
	oTuple.action = aTokens[3].toLowerCase();

	if( aTokens.length < 5 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error en la linea " + (nLineNum + 1) + ": missing &lt;new state&gt;!" ;
		return( oTuple );
	}
	oTuple.newState = aTokens[4];
	
	if( aTokens.length > 6 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error en la linea " + (nLineNum + 1) + ": too many entries!" ;
		return( oTuple );
	}
	if( aTokens.length == 6 ) {
		if( aTokens[5] == "!" ) {
			oTuple.breakpoint = true;
		} else {
			oTuple.isValid = false;
			oTuple.error = "Syntax error en la linea " + (nLineNum + 1) + ": too many entries!";
			return( oTuple );
		}
	} else {
		oTuple.breakpoint = false;
	}

	oTuple.isValid = true;
	return( oTuple );
}

function GetNextInstructions( sState, sHeadSymbol ){
  var result = null;
	if( aProgram[sState] != null && aProgram[sState][sHeadSymbol] != null ) {
		return( aProgram[sState][sHeadSymbol] );
	} else if( aProgram[sState] != null && aProgram[sState]["*"] != null ) {
		return( aProgram[sState]["*"] );
	} else if( aProgram["*"] != null && aProgram["*"][sHeadSymbol] != null ) {
		return( aProgram["*"][sHeadSymbol] );
	} else if( aProgram["*"] != null && aProgram["*"]["*"] != null ) {
		return( aProgram["*"]["*"] );
	} else {
    return( [] );
  }
}

function GetTapeSymbol( n ){
	if( n < nTapeOffset || n >= sTape.length + nTapeOffset ) {
		debug( 4, "GetTapeSymbol( " + n + " ) = '" + c + "'   outside sTape range" );
		return( "_" );
	} else {
		var c = sTape.charAt( n - nTapeOffset );
		if( c == " " ) { c = "_"; debug( 4, "Advertencia: GetTapeSymbol() got SPACE no _ !" ); }
		debug( 4, "GetTapeSymbol( " + n + " ) = '" + c + "'" );
		return( c );
	}
}

function SetTapeSymbol( n, c ){
	debug( 4, "SetTapeSymbol( " + n + ", " + c + " ); sTape = '" + sTape + "' nTapeOffset = " + nTapeOffset );
	if( c == " " ) { c = "_"; debug( 4, "Advertencia: SetTapeSymbol() with SPACE no _ !" ); }
	
	if( n < nTapeOffset ) {
		sTape = c + repeat( "_", nTapeOffset - n - 1 ) + sTape;
		nTapeOffset = n;
	} else if( n > nTapeOffset + sTape.length ) {
		sTape = sTape + repeat( "_", nTapeOffset + sTape.length - n - 1 ) + c;
	} else {
		sTape = sTape.substr( 0, n - nTapeOffset ) + c + sTape.substr( n - nTapeOffset + 1 );
	}
}

function SetStatusMessage( sString, nBgFlash ){
	$( "#MachineStatusMsgText" ).html( sString );
  if( nBgFlash > 0 ) {
    $("#MachineStatusMsgBg").stop(true, true).css("background-color",(nBgFlash==1?"#c9f2c9":"#ffb3b3")).show().fadeOut(600);
  }
  if( sString != "" && sPreviousStatusMsg == sString && nBgFlash != -1 ) {
    $("#MachineStatusMsgBg").stop(true, true).css("background-color","#bbf8ff").show().fadeOut(600);
  }
  if( sString != "" ) sPreviousStatusMsg = sString;
}

function SetSyntaxMessage( msg ){
	$("#SyntaxMsg").html( (msg?msg:"&nbsp;") )
}

function RenderTape(){
	var nTranslatedHeadPosition = nHeadPosition - nTapeOffset;
	var sFirstPart, sHeadSymbol, sSecondPart;
	debug( 4, "RenderTape: translated head pos: " + nTranslatedHeadPosition + "  head pos: " + nHeadPosition + "  tape offset: " + nTapeOffset );
	debug( 4, "RenderTape: sTape = '" + sTape + "'" );

	if( nTranslatedHeadPosition > 0 ) {
		sFirstPart = sTape.substr( 0, nTranslatedHeadPosition );
	} else {
		sFirstPart = "";
	}
	if( nTranslatedHeadPosition > sTape.length ) {
		sFirstPart += repeat( " ", nTranslatedHeadPosition - sTape.length );
	}
	sFirstPart = sFirstPart.replace( /_/g, " " );
	
	if( nTranslatedHeadPosition >= 0 && nTranslatedHeadPosition < sTape.length ) {
		sHeadSymbol = sTape.charAt( nTranslatedHeadPosition );
	} else {
		sHeadSymbol = " ";
	}
	sHeadSymbol = sHeadSymbol.replace( /_/g, " " );
	
	if( nTranslatedHeadPosition >= 0 && nTranslatedHeadPosition < sTape.length - 1 ) {
		sSecondPart = sTape.substr( nTranslatedHeadPosition + 1 );
	}else {
		sSecondPart = "";
	}
	sSecondPart = sSecondPart.replace( /_/g, " " );
	
	debug( 4, "RenderTape: sFirstPart = '" + sFirstPart + "' sHeadSymbol = '" + sHeadSymbol + "'  sSecondPart = '" + sSecondPart + "'" );
	
	$("#LeftTape").text( sFirstPart );
	$("#ActiveTape").text( sHeadSymbol );
	$("#RightTape").text( sSecondPart );
	
}

function RenderState(){
	$("#MachineState").html( sState );
}

function RenderSteps(){
	$("#MachineSteps").html( nSteps );
}

function UpdateInterface(){
	RenderTape();
	RenderState();
	RenderSteps();
}

function EnableControls( bStep, bRun, bStop, bReset, bSpeed, bTextarea, bUndo ){
  document.getElementById( 'StepButton' ).disabled = !bStep;
  document.getElementById( 'RunButton' ).disabled = !bRun;
  document.getElementById( 'StopButton' ).disabled = !bStop;
  document.getElementById( 'ResetButton' ).disabled = !bReset;
  document.getElementById( 'Source' ).disabled = !bTextarea;
  EnableUndoButton(bUndo);
}

function EnableUndoButton(bUndo){
  document.getElementById( 'UndoButton' ).disabled = !(bUndo && aUndoList.length > 0);
}


function StepButton(){
	SetStatusMessage( "", -1 );
	Step();
	EnableUndoButton(true);
}

function RunButton(){
	SetStatusMessage( "Cargando..." );
	EnableControls( false, false, true, false, false, false, false );
	Run();
}

function StopButton(){
	if( hRunTimer != null ) {
		SetStatusMessage( "En pausa Haga clic en 'Ejecutar' o 'Paso' para reanudar." );
		EnableControls( true, true, false, true, true, true, true );
		StopTimer();
	}
}

function ResetButton(){
	SetStatusMessage( "Reinicio la máquina. Clic en 'Ejecutar' o 'Paso' para iniciar" );
	Reset();
	EnableControls( true, true, false, true, true, true, false );
}

function SetupVariantCSS(){
  if( nVariant == 1 ) {
    $("#LeftTape").addClass( "OneDirectionalTape" );
  } else {
    $("#LeftTape").removeClass( "OneDirectionalTape" );
  }
}

function ShowResetMsg(b){
  if( b ) {
    $("#ResetMessage").fadeIn();
    $("#ResetButton").addClass("glow");
  } else {
    $("#ResetMessage").hide();
    $("#ResetButton").removeClass("glow");
  }
}

function TextareaChanged(){
	var nNewLines = (oTextarea.value.match(/\n/g) ? oTextarea.value.match(/\n/g).length : 0) + 1;
	if( nNewLines != nTextareaLines ) {
		nTextareaLines = nNewLines
		UpdateTextareaDecorations();
	}
	
	bIsDirty = true;
	oPrevInstruction = null;
	RenderLineMarkers();
}

function UpdateTextareaDecorations(){
	var oBackgroundDiv = $("#SourceBackground");
	oBackgroundDiv.empty();
	var sSource = oTextarea.value;
	sSource = sSource.replace( /\r/g, "" );
	var aLines = sSource.split("\n");
	
	for( var i = 0; i < aLines.length; i++)
	{
		oBackgroundDiv.append($("<div id='talinebg"+(i+1)+"' class='talinebg'><div class='talinenum'>"+(i+1)+"</div></div>"));
	}
	
	UpdateTextareaScroll();
}

function SetActiveLines( next, prev ){
	$(".talinebgnext").removeClass('talinebgnext');
	$(".NextLineMarker").remove();
	$(".talinebgprev").removeClass('talinebgprev');
	$(".PrevLineMarker").remove();
	
    var shift = false;
	for( var i = 0; i < next.length; i++ )
	{
    var oMarker = $("<div class='NextLineMarker'>Next<div class='NextLineMarkerEnd'></div></div>");
    $("#talinebg"+(next[i]+1)).addClass('talinebgnext').prepend(oMarker);
    if( next[i] == prev ) {
      oMarker.addClass('shifted');
      shift = true;
    }
	}
	if( prev >= 0 )
	{
    var oMarker = $("<div class='PrevLineMarker'>Prev<div class='PrevLineMarkerEnd'></div></div>");
    if( shift ) {
      $("#talinebg"+(prev+1)).prepend(oMarker);
      oMarker.addClass('shifted');
    } else {
      $("#talinebg"+(prev+1)).addClass('talinebgprev').prepend(oMarker);
    }
	}
}

function SetErrorLine( num ){
	$("#talinebg"+(num+1)).addClass('talinebgerror');
}

function ClearErrorLines(){
	$(".talinebg").removeClass('talinebgerror');
}



function OnLoad(){
	oTextarea = $("#Source")[0];
}

function debug( n, str ){
}