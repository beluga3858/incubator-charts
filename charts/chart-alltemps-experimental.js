window.onload=function(){
  // chart title
  var chart_title = 'All Incubator Temperatures';
  var chart_subtitle = 'Dynamic loading with decimation';

  // series to plot
  var series = [
    {name: 'Janoel'        , field: 2, ch_id: 519385, api_key: 'TUDLH2CIKZ7MTHIV', color: 'purple', conv: useFahrenheit?temperatureCtoF:null },
    {name: 'Yellow clone'  , field: 4, ch_id: 519385, api_key: 'TUDLH2CIKZ7MTHIV', color: 'yellow', conv: useFahrenheit?temperatureCtoF:null },
    {name: 'RCom'          , field: 6, ch_id: 519385, api_key: 'TUDLH2CIKZ7MTHIV', color: 'green', conv: useFahrenheit?temperatureCtoF:null },
    {name: 'Ambient'       , field: 8, ch_id: 519385, api_key: 'TUDLH2CIKZ7MTHIV', color: 'cyan', conv: useFahrenheit?temperatureCtoF:null },
    {name: 'Xiaomi 2'      , field: 2, ch_id: 540129, api_key: 'HY04Q2ZFA2H86L5X', color: 'blue', conv: useFahrenheit?temperatureCtoF:null },
    {name: 'Humigadget2'   , field: 4, ch_id: 540129, api_key: 'HY04Q2ZFA2H86L5X', color: 'orange', conv: useFahrenheit?temperatureCtoF:null },
    {name: 'Styro (Xiaomi)', field: 6, ch_id: 540129, api_key: 'HY04Q2ZFA2H86L5X', color: 'darkolivegreen', conv: useFahrenheit?temperatureCtoF:null },
    {name: 'Humigadget3'   , field: 8, ch_id: 540129, api_key: 'HY04Q2ZFA2H86L5X', color: 'pink', conv: useFahrenheit?temperatureCtoF:null }
  ];

  // reference line value
  var reference_line = 37.5; 
  if (useFahrenheit) reference_line = temperatureCtoF(reference_line);

  // add a blank chart
  var my_chart = addChartMultiTemperature(chart_title, chart_subtitle);

  // start and end times to plot
  var end_time = new Date();
  var start_time = new Date();
  start_time.setTime(end_time.getTime() - (4/*30*/*24*60*60*1000)); // 30 days

  // add the series
  for (var i=0; i<series.length; i++) {
    var s = series[i];
    addSeries(my_chart, s.name, s.ch_id, s.field, s.api_key, start_time, end_time, s.color, 0, s.conv);
  }

  // add reference line
  addReferenceLine(my_chart, reference_line);
}
        
//------------------------------------------------------------------------------------------       
  
  // dynamically update data for visible region
  function afterSetExtremes(e) {
    for (let i=0; i<series.length; i++) {
      let s = series[i];        
      updateSeries(Highcharts.charts[0], s.name, s.ch_id, s.field, s.api_key, e.min, e.max, s.color, 0, s.conv);
    }
  }  

  // get date in thingspeak query format (UTC) YYYY-MM-DD%20HH:NN:SS
	function thingspeakFormatDate(date) {
  	let d = new Date(date);
    return d.toISOString().substr(0,19).replace("T"," ");
  }
  
  // calculate decimation value for thingspeak
  function thingspeakDecimation(start_time, end_time) {
    let range = (end_time-start_time)/(60*1000); // in minutes
    for (let decimation of [/*1440,720,240,*/60,30,20,10]) { 
    	if ((range/decimation) > 130) return decimation;
    }
    return 0;
  }
  
  // add a data series to the chart
  function addSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function) {
  	_loadSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function, true);
  }
  
  // update a data series on the chart
  function updateSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function) {
    _loadSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function, false);
  }
  
  // add or update a data series 
  function _loadSeries(chart, name, channel_id, field_number, api_key, start_time, end_time, color, yaxis, conversion_function, add_new) {
    yaxis = yaxis || 0;
    conversion_function = conversion_function || function(x) {return x};

 		// calculate data decimation (if any)
    var decimation=thingspeakDecimation(start_time, end_time);

    // get the data with a webservice call
    var URL = 'https://api.thingspeak.com/channels/' + channel_id + 
        '/fields/' + field_number + '.json?offset=0&round=2' +
        '&api_key=' + api_key + // '&results=' + results + 
        '&start=' + thingspeakFormatDate(start_time) + '&end=' + thingspeakFormatDate(end_time) +
        '&median=' + decimation; 

    $.getJSON(URL, function(data) {

      var chart_data = [];
      var field_name = 'field' + field_number;
      var prev_time = Date.parse(data.feeds[0].created_at);
    
      // iterate through each feed
      $.each(data.feeds, function() {
        // get value and time
        var value = conversion_function(parseFloat(this[field_name]));
        var time = Date.parse(this.created_at);
        // skip nulls in data (data with a time but no measurement)
        if (isNaN(value)) return;
        // deliberately add gap if no measurements for several minutes
        if (time-prev_time > (decimation+5)*60*1000) chart_data.push([time-1,null]);
        prev_time=time;
        // add to chart data
        chart_data.push([time, value]);
      });
      
      // add/update the chart data (if valid)
      if (chart_data.length) {
        if (add_new) {
          chart_data.push([Date.parse(end_time+1), null]); // ensure end time included
          chart.addSeries({ data: chart_data, name: name, color: standardize_color(color), yAxis: yaxis, id: name}); 
        } else {
          chart.get(name).setData(chart_data);     
        }
      }
    });
  }   

  // create a multi temperature chart (stock chart style)
  function addChartMultiTemperature(title, subtitle, y_axis_title) {

    var chartOptions = {
      chart: {
        renderTo: 'chart-container',
        zoomType: 'x'
      },
    
    	time: {
        useUTC: false
      },        

      rangeSelector: {
        buttons: [
          { type: 'minute', count: 60, text: '60m' },
          { type: 'hour',   count: 3,  text: '3h'  },
          { type: 'hour',   count: 12, text: '12h' },
          { type: 'day',    count: 1,  text: '1d'  },              
          { type: 'all',               text: 'All' },                 
        ],
        selected: 3
      },

      xAxis: {
        ordinal: false,
        events: {
          afterSetExtremes: afterSetExtremes
        },
        minRange: 3600 * 1000 // one hour
      },      

      yAxis: {
        title: { text: 'Temperature °'+(useFahrenheit?'F':'C') }
      },

      title: { text: title },

      subtitle: { text: subtitle },

			plotOptions: {
        series: {
          showInNavigator: true,
          dataGrouping: {
            enabled: false, 
          }  
        },
      },
      
      navigator: {
        adaptToUpdatedData: false,
        series: {
          fillOpacity: 0,
          dataGrouping: {
            enabled: false,
          }
        }
      },  

      scrollbar: {
        liveRedraw: false
      },      
      
      tooltip: {
        valueDecimals: 2,
        valueSuffix: '°'+(useFahrenheit?'F':'C')
      },
        
      exporting: { 
        menuItemDefinitions: {
            // Custom definition
            units: {
                onclick: function () {
                  // toggle temperature units
                  sessionStorage.setItem('fahrenheit',(!useFahrenheit).toString());
                  location.reload();
                },
                text: useFahrenheit?'Celsius':'Fahrenheit'
            }
        },
        buttons: {
          contextButton: {
            menuItems: ['downloadPNG','units']
          }
        }
      },
      
      legend: { enabled: true },
      
      credits: {
        text: 'casportpony.com',
        href: '' // 'https://casportpony.com/' does not work on google sites
      }        

    };
    
    // create the chart
    return new Highcharts.stockChart(chartOptions);
  }
  
	// convert color to RGB code
  function standardize_color(str){ 
    var ctx = document.createElement('canvas').getContext('2d'); 
    ctx.fillStyle = str; 
    return ctx.fillStyle; 
  } 
 
