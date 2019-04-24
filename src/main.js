// Copied, with permission, from: https://adsscripts.nl/scripts/google-ads-scripts/247-bidding-2
//
// Copyright 2019. Increase BV. All Rights Reserved.
//
// Created By: Tibbe van Asten
// for Increase B.V.
//
// Created 18-06-2018
// Last update: 04-04-2019
//
// ABOUT THE SCRIPT
// This scripts automatically ads a bidadjustment to every hour
// of the day, based of historical CPA. The CPA of the current and
// upcoming 5 hours will be compared to the campaign CPA and a 
// bidadjustment will be set accordingly.
//
////////////////////////////////////////////////////////////////////

var config = {
  
  LOG : true,      

  // This daterange is used to calculate the campaign CPA.
  DATE_RANGE : "LAST_30_DAYS",
  
  // Google Sheet to report the bidadjustments that are set.
  // For every campaign in your account a new sheet will be created.
  // Make a copy from our spreadsheet here: https://docs.google.com/spreadsheets/d/1FtzNSE2bCBxYbswqMIAjGw2sgLZTTCN35_uYwOx8BUA/copy
  // Leave the 'Template' sheet in there
  SPREADSHEET_URL : "SPREADSHEET_URL",
  
  // Select which campaigns to include. For example: ["foo", "bar"] will include 
  // only campaigns with label 'foo' or 'bar'. Leave blank [] to include all campaigns.
  CAMPAIGN_LABEL : ["Hourly Bidding"],
  
  // If set to true, this script will run your search and/or shopping campaigns.
  INCLUDE_SEARCH : true,
  INCLUDE_SHOPPING : true,
  
  // The minimum and maximum for the bidmodifiers.
  // Minimal: 0.75 equals -25%. Maximum: 1.3 equals +30%
  MIN_BID : 0.75,
  MAX_BID : 1.3

}

////////////////////////////////////////////////////////////////////
// Do not make any changes below this line

function main() {
  
  var ss = connectSheet();

  // Selecting all search campaigns
  if(config.INCLUDE_SEARCH === true){
      
    var campaignSelector = AdsApp.campaigns().withCondition("Status = ENABLED");
    runningCampaigns(campaignSelector, ss);
    
  } // include search

  // Selecting all shopping campaigns
  if(config.INCLUDE_SHOPPING === true){
    
    var shoppingCampaignSelector = AdsApp.shoppingCampaigns().withCondition("Status = ENABLED");
    runningCampaigns(shoppingCampaignSelector, ss);
    
  } // include shopping
  
  Logger.log("Thanks for using this custom script by Tibbe van Asten. Winning!");

} // function main()

////////////////////////////////////////////////////////////////////
	
function runningCampaigns(campaignSelector, ss){
  
  // Filter campaigns if labels are defined
  if(config.CAMPAIGN_LABEL.length > 0){
    campaignSelector = campaignSelector.withCondition("LabelNames CONTAINS_ANY ['" + config.CAMPAIGN_LABEL + "']");
  }

  var campaignIterator = campaignSelector.get();

  while (campaignIterator.hasNext()) {
    var campaign = campaignIterator.next();
    
    var sheet = checkSheet(ss, campaign);   

    // Calculating the campaign CPA to use in all functions
    var campaignCpa = campaign.getStatsFor(config.DATE_RANGE).getCost() / campaign.getStatsFor(config.DATE_RANGE).getConversions();

    // We only want to alter the campaigns with manual bidding strategies and actual conversions
    // All other campaigns are skipped
    if(isFinite(campaignCpa) == false && (campaign.getBiddingStrategyType() !== "MANUAL_CPC" || campaign.getBiddingStrategyType() !== "MANUAL_CPM" || campaign.bidding().getBiddingStrategyType() !== "MANUAL_CPV")) continue;

       	Logger.log("-----");
    	Logger.log("Campaign: " + campaign.getName());
        Logger.log("CPA: " + campaignCpa);
        Logger.log("-----");

    bidadjustmentAdschedule(campaign, campaignCpa, sheet);

  } // campaignIterator

} // function runningCampaings()

////////////////////////////////////////////////////////////////////

function connectSheet(){
  
  if(config.SPREADSHEET_URL == "SPREADSHEET_URL"){
    throw error("Define spreadsheet URL in config");
  } else{
    var ss = SpreadsheetApp.openByUrl(config.SPREADSHEET_URL);
    return ss;
  }  
  
} // function connectSheet()

////////////////////////////////////////////////////////////////////

function checkSheet(ss, campaign){
  
  var sheet = ss.getSheetByName(campaign.getName());
  
  // If a sheet with the campaignname doesn't already exists
  // we will create a new sheet from the 'Template'-sheet in the spreadsheet.
  if (sheet == null) {
    var templateSheet = ss.getSheetByName("Template");
    ss.insertSheet(campaign.getName(), {template: templateSheet});
    var sheet = ss.getSheetByName(campaign.getName());
      
    if(config.LOG === true){
      Logger.log("New sheet created for " + campaign.getName());
    }
      
  } // if sheet doesn't exists
  
  return sheet;
  
} // checkSheet()

////////////////////////////////////////////////////////////////////

function bidadjustmentAdschedule(campaign, campaignCpa, sheet) {

  // Set dates to retrieve 12 months of data
  // The script will always look at the last 12 months of data
  var today = Utilities.formatDate(new Date(), AdWordsApp.currentAccount().getTimeZone(), 'MMMM dd, yyyy HH:mm:ss');
  var date = new Date();
  var firstDay = new Date(date.getFullYear(today), date.getMonth(today) - 12, 1);
  var lastDay = new Date(date.getFullYear(), date.getMonth(), 0);
  var firstMonth = firstDay.getMonth() + 1;
  var lastMonth = lastDay.getMonth() + 1;

    //Format months to make sure they will work in the selectors
    if(firstMonth < 10) {
      var firstMonth = "0" + firstMonth;
    }
    if(lastMonth < 10) {
      var lastMonth = "0" + lastMonth;
    }

  // We calculate the average campaign CPA and campaign conversions per hour to compare them
  // with stats per hour and day of the week
  var campaignCpa = campaign.getStatsFor(firstDay.getYear() + firstMonth + "01",lastDay.getYear() + lastMonth + lastDay.getDate()).getCost() / campaign.getStatsFor(firstDay.getYear() + firstMonth + "01",lastDay.getYear() + lastMonth + lastDay.getDate()).getConversions();
  var campaignConversions = campaign.getStatsFor(firstDay.getYear() + firstMonth + "01",lastDay.getYear() + lastMonth + lastDay.getDate()).getConversions() / (24*7);

  // Remove existing adSchedules to start clean
  var adScheduleIterator = campaign.targeting()
    .adSchedules()
    .get();

  while (adScheduleIterator.hasNext()) {
    var adSchedule = adScheduleIterator.next();
    adSchedule.remove();
  }
  
  var weekday = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

  // Retrieving stats per hour and day of the week
  var report = AdsApp.report(
    "SELECT Conversions, Cost, CostPerConversion, AveragePosition, HourOfDay, SearchImpressionShare, DayOfWeek " +
    "FROM CAMPAIGN_PERFORMANCE_REPORT " +
    "WHERE CampaignId = " + campaign.getId() + " " +
    "DURING " + firstDay.getYear() + firstMonth + "01, " + lastDay.getYear() + lastMonth + lastDay.getDate());

  var rows = report.rows();
  while (rows.hasNext()) {
    var row = rows.next();

    var nextHour = parseInt(row["HourOfDay"]); nextHour = nextHour + 1;

    // The tricky part: we can only add six adschedules each day. So when running this script every hour
    // we will only add the upcoming 5 hour
    var date = Utilities.formatDate(new Date(), AdsApp.currentAccount().getTimeZone(), 'MMMM dd, yyyy HH:mm:ss');

    if(row["DayOfWeek"] == weekday[new Date(date).getDay()] && row["HourOfDay"] > (new Date(date).getHours() -1) && row["HourOfDay"] < (new Date(date).getHours() +6)){

      // With 0 conversions and costs higher then the campaign CPA average, we will set a negative bidadjustment.
      if(row["Conversions"] == 0 && row["Cost"] > campaignCpa){
        var bidModifier = config.MIN_BID;
        campaign.addAdSchedule(row["DayOfWeek"].toUpperCase(), parseInt(row["HourOfDay"]), 0, parseInt(nextHour), 0, bidModifier);
        setCell(row["HourOfDay"], date, bidModifier, sheet);
        
        	Logger.log(row["DayOfWeek"] + " " + row["HourOfDay"] + " Bidmodifier 1: " + config.MIN_BID);
      }

      // When the costs per conversion are higher then the campaign average, we will set a negative bidadjustment.
      // To make sure we don't lose all of our conversions, we check the number of conversions as well.
      // When the number of conversions is higher then (average / 2) we decrease the negative bidadjustment with 50%
      // We also take the conversionrate of the current day in consideration. If this is higher than the campaign average, we bisect the bidadjustment.

      else if(row["Conversions"] > 0 && row["CostPerConversion"] > campaignCpa){

        if(row["Conversions"] < (campaignConversions / 2)){
          var bidModifier = campaignCpa / row["CostPerConversion"];bidModifier = 1 - bidModifier; bidModifier = bidModifier / 2; bidModifier = 1 - bidModifier;
          if(bidModifier < config.MIN_BID){ bidModifier = config.MIN_BID; }
          
          if(campaign.getStatsFor("TODAY").getConversionRate > campaign.getStatsFor("LAST_30_DAYS").getConversionRate()){
            bidModifier = 1 - bidModifier; bidModifier = bidModifier / 2; bidModifier = 1 - bidModifier;
            
            	Logger.log("Good conversionrate");
          }
          
          campaign.addAdSchedule(row["DayOfWeek"].toUpperCase(), parseInt(row["HourOfDay"]), 0, parseInt(nextHour), 0, bidModifier);
          setCell(row["HourOfDay"], date, bidModifier, sheet);
        }
        
        if(row["Conversions"] > (campaignConversions / 2)) {
          var bidModifier = campaignCpa / row["CostPerConversion"]; bidModifier = 1 - bidModifier; bidModifier = bidModifier / 4; bidModifier = 1 - bidModifier;
          if(bidModifier < config.MIN_BID){ bidModifier = config.MIN_BID; }
          
          if(campaign.getStatsFor("TODAY").getConversionRate > campaign.getStatsFor("LAST_30_DAYS").getConversionRate()){
            bidModifier = 1 - bidModifier; bidModifier = bidModifier / 2; bidModifier = 1 - bidModifier;
            
            	Logger.log("Good conversionrate");
          }
          
          campaign.addAdSchedule(row["DayOfWeek"].toUpperCase(), parseInt(row["HourOfDay"]), 0, parseInt(nextHour), 0, bidModifier);
          setCell(row["HourOfDay"], date, bidModifier, sheet);
        }
      }

      // When the cost per conversion is lower then the campaign average, we can set a positive bidadjustment.
      // We also take average position and impression share in account. When both are better then the thresholds,
      // we won't set a positive bidadjustment, because there is too little to win.

      else if(row["CostPerConversion"] > 0 && row["CostPerConversion"] < campaignCpa && (parseInt(row["SearchImpressionShare"]) < 90 || row["AveragePosition"] > 1.5)){
        var bidModifier = campaignCpa / row["CostPerConversion"];
        if(bidModifier > config.MAX_BID){ bidModifier = config.MAX_BID; }
        
        campaign.addAdSchedule(row["DayOfWeek"].toUpperCase(), parseInt(row["HourOfDay"]), 0, parseInt(nextHour), 0, bidModifier);
        setCell(row["HourOfDay"], date, bidModifier, sheet);
      }

      // When no conversions are recorded, we still need to add the timeslot to make sure our ads are shown
      
      else{
        //(!(row["Conversions"] == 0 && row["Cost"] > campaignCpa) && !(row["Conversions"] > 0 && row["CostPerConversion"] > campaignCpa) && !(row["CostPerConversion"] > 0 && row["CostPerConversion"] < campaignCpa && (parseInt(row["SearchImpressionShare"]) < 90 || row["AveragePosition"] > 1.5)))
        var bidModifier = 1;
      	campaign.addAdSchedule(row["DayOfWeek"].toUpperCase(), parseInt(row["HourOfDay"]), 0, parseInt(nextHour), 0, bidModifier);
        setCell(row["HourOfDay"], date, bidModifier, sheet);
      }
      
        // Change the bidModifer, to make it more understandabe in the log
        if(bidModifier < 1){
          bidModifier = 1 - bidModifier; bidModifier = bidModifier * -1;
        } else if (bidModifier < 1.01 && bidModifier > 0.99){
          bidModifier = 0;
        } else{
          bidModifier = bidModifier - 1;
        }  
      
      	// Round up the bid for the Log, like the bidadjustment will be set in the campaign
        bidModifier = Math.round(bidModifier * 100);

      	Logger.log(row["DayOfWeek"] + " " + row["HourOfDay"] + " Bidmodifier: " + bidModifier);

    } // End of day + hour check

  } // End of row-iterator

  if(config.LOG === true) {
  	Logger.log(" ");
  }

} // function bidadjustmentAdschedule()

////////////////////////////////////////////////////////////////////

function setCell(hour, date, bid, sheet){
  
  var column = ["H","B","C","D","E","F","G"];

  var row = parseInt(hour) + 3;  	
  var col = column[new Date(date).getDay()];
  var cellBid = col + row;
  var cellDate = col + 2;
  
  // Change the bid, to make it more understandabe in the sheet
  if(bid < 1){
    bid = 1 - bid; bid = bid * -1;
  } else if (bid < 1.01 && bid > 0.99){
    bid = 0;
  } else{
    bid = bid - 1;
  }  
  
  // Round up the bid for the Google sheet, like the
  // bidadjustment will be set in the campaign
  bid = Math.round(bid * 100) / 100;
  
  sheet.getRange(cellBid).setValue(bid);
  sheet.getRange(cellDate).setValue(new Date());
  
} // function setCell()
